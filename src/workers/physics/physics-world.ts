import RAPIER from "@dimforge/rapier3d-compat";
import type {
  EntityId,
  Transform,
  PhysicsBodyConfig,
  CharacterControllerConfig,
  MovementInput,
  TransformUpdateBatch,
} from "~/shared/types";

/**
 * PhysicsWorld - Rapier physics simulation in worker context
 *
 * Manages physics bodies, character controller, and simulation stepping.
 * Sends transform updates to render worker each step.
 */
export default class PhysicsWorld {
  private world: RAPIER.World | null = null;
  private eventQueue: RAPIER.EventQueue | null = null;

  // Entity management
  private bodies: Map<EntityId, RAPIER.RigidBody> = new Map();
  private colliders: Map<EntityId, RAPIER.Collider> = new Map();

  // Character controller
  private characterController: RAPIER.KinematicCharacterController | null =
    null;
  private playerId: EntityId | null = null;
  private playerInput: MovementInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
  };
  private playerRotationY = 0;

  // Movement settings
  private readonly moveSpeed = 3;
  private readonly sprintMultiplier = 2;
  private readonly turnSpeed = 3;
  private readonly gravity = -20;

  // Simulation loop
  private running = false;
  private lastTime = 0;
  private onUpdate: ((updates: TransformUpdateBatch) => void) | null = null;

  async init(
    gravity: { x: number; y: number; z: number } = { x: 0, y: -9.81, z: 0 },
  ): Promise<void> {
    // Initialize Rapier WASM
    await RAPIER.init();

    // Create physics world
    this.world = new RAPIER.World(gravity);

    // Create event queue for collision events
    this.eventQueue = new RAPIER.EventQueue(true);

    console.log("[PhysicsWorld] Initialized with gravity:", gravity);
  }

  spawnEntity(
    entityId: EntityId,
    transform: Transform,
    config: PhysicsBodyConfig,
  ): void {
    if (!this.world) {
      console.error("[PhysicsWorld] World not initialized");
      return;
    }

    // Create rigid body descriptor
    let bodyDesc: RAPIER.RigidBodyDesc;
    switch (config.type) {
      case "static":
        bodyDesc = RAPIER.RigidBodyDesc.fixed();
        break;
      case "dynamic":
        bodyDesc = RAPIER.RigidBodyDesc.dynamic();
        break;
      case "kinematic":
        bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased();
        break;
    }

    // Set position and rotation
    bodyDesc.setTranslation(
      transform.position.x,
      transform.position.y,
      transform.position.z,
    );
    bodyDesc.setRotation({
      x: transform.rotation.x,
      y: transform.rotation.y,
      z: transform.rotation.z,
      w: transform.rotation.w,
    });

    // Create the body
    const body = this.world.createRigidBody(bodyDesc);

    // Create collider
    let colliderDesc: RAPIER.ColliderDesc;
    switch (config.colliderType) {
      case "cuboid":
        colliderDesc = RAPIER.ColliderDesc.cuboid(
          config.dimensions.x / 2,
          config.dimensions.y / 2,
          config.dimensions.z / 2,
        );
        break;
      case "ball":
        colliderDesc = RAPIER.ColliderDesc.ball(config.radius ?? 0.5);
        break;
      case "capsule":
        colliderDesc = RAPIER.ColliderDesc.capsule(
          (config.height ?? 1) / 2,
          config.radius ?? 0.5,
        );
        break;
      default:
        colliderDesc = RAPIER.ColliderDesc.cuboid(
          config.dimensions.x / 2,
          config.dimensions.y / 2,
          config.dimensions.z / 2,
        );
    }

    // Set physics properties
    if (config.friction !== undefined) {
      colliderDesc.setFriction(config.friction);
    }
    if (config.restitution !== undefined) {
      colliderDesc.setRestitution(config.restitution);
    }

    const collider = this.world.createCollider(colliderDesc, body);

    // Store references
    this.bodies.set(entityId, body);
    this.colliders.set(entityId, collider);

    console.log("[PhysicsWorld] Spawned entity:", entityId, config.type, {
      position: transform.position,
      dimensions: config.dimensions,
      colliderHandle: collider.handle,
    });
  }

  spawnPlayer(
    id: EntityId,
    transform: Transform,
    config: CharacterControllerConfig,
  ): void {
    if (!this.world) {
      console.error("[PhysicsWorld] World not initialized");
      return;
    }

    // Create kinematic rigid body for player
    const bodyDesc =
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );

    const body = this.world.createRigidBody(bodyDesc);

    // Create capsule collider for player
    const colliderDesc = RAPIER.ColliderDesc.capsule(
      config.capsuleHeight / 2,
      config.capsuleRadius,
    );
    const collider = this.world.createCollider(colliderDesc, body);

    // Create character controller
    this.characterController = this.world.createCharacterController(0.01);
    this.characterController.enableAutostep(
      config.stepHeight,
      config.stepHeight,
      true,
    );
    this.characterController.enableSnapToGround(0.5);
    this.characterController.setMaxSlopeClimbAngle(
      (config.maxSlopeAngle * Math.PI) / 180,
    );
    this.characterController.setMinSlopeSlideAngle(
      (config.minSlopeSlideAngle * Math.PI) / 180,
    );

    // Store references
    this.bodies.set(id, body);
    this.colliders.set(id, collider);
    this.playerId = id;

    // Initialize rotation from transform (extract Y rotation from quaternion)
    this.playerRotationY = this.quaternionToYRotation(transform.rotation);

    console.log("[PhysicsWorld] Spawned player:", id);
  }

  private quaternionToYRotation(q: {
    x: number;
    y: number;
    z: number;
    w: number;
  }): number {
    // Extract Y rotation (yaw) from quaternion
    const siny_cosp = 2 * (q.w * q.y + q.z * q.x);
    const cosy_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
    return Math.atan2(siny_cosp, cosy_cosp);
  }

  private yRotationToQuaternion(yRotation: number): {
    x: number;
    y: number;
    z: number;
    w: number;
  } {
    // Convert Y rotation to quaternion (rotation around Y axis)
    const halfAngle = yRotation / 2;
    return {
      x: 0,
      y: Math.sin(halfAngle),
      z: 0,
      w: Math.cos(halfAngle),
    };
  }

  removeEntity(id: EntityId): void {
    if (!this.world) return;

    const body = this.bodies.get(id);
    if (body) {
      this.world.removeRigidBody(body);
      this.bodies.delete(id);
      this.colliders.delete(id);
    }

    if (this.playerId === id) {
      this.playerId = null;
      this.characterController = null;
    }
  }

  setPlayerInput(input: MovementInput): void {
    this.playerInput = input;
  }

  start(onUpdate: (updates: TransformUpdateBatch) => void): void {
    this.onUpdate = onUpdate;
    this.running = true;
    this.lastTime = performance.now();
    this.step();
  }

  pause(): void {
    this.running = false;
  }

  resume(): void {
    if (!this.running) {
      this.running = true;
      this.lastTime = performance.now();
      this.step();
    }
  }

  private step = (): void => {
    if (!this.running || !this.world) return;

    const now = performance.now();
    const deltaMs = now - this.lastTime;
    this.lastTime = now;

    const deltaSeconds = Math.min(deltaMs / 1000, 0.1); // Cap at 100ms

    // Update player movement
    this.updatePlayer(deltaSeconds);

    // Step the physics world
    this.world.step(this.eventQueue!);

    // Collect transform updates
    const updates = this.collectTransformUpdates();

    // Send updates to render worker
    if (this.onUpdate && updates.length > 0) {
      this.onUpdate({
        timestamp: now,
        updates,
      });
    }

    // Schedule next step
    setTimeout(this.step, 1000 / 60); // 60 Hz physics
  };

  private updatePlayer(deltaSeconds: number): void {
    if (!this.characterController || !this.playerId || !this.world) return;

    const body = this.bodies.get(this.playerId);
    const collider = this.colliders.get(this.playerId);
    if (!body || !collider) return;

    // Handle rotation (A/D)
    if (this.playerInput.left) {
      this.playerRotationY += this.turnSpeed * deltaSeconds;
    }
    if (this.playerInput.right) {
      this.playerRotationY -= this.turnSpeed * deltaSeconds;
    }

    // Calculate movement direction
    let moveX = 0;
    let moveZ = 0;

    if (this.playerInput.forward) {
      moveX += Math.sin(this.playerRotationY);
      moveZ += Math.cos(this.playerRotationY);
    }
    if (this.playerInput.backward) {
      moveX -= Math.sin(this.playerRotationY);
      moveZ -= Math.cos(this.playerRotationY);
    }

    // Apply speed
    const speed = this.playerInput.sprint
      ? this.moveSpeed * this.sprintMultiplier
      : this.moveSpeed;

    // Compute desired movement
    const desiredMovement = {
      x: moveX * speed * deltaSeconds,
      y: this.gravity * deltaSeconds, // Apply gravity
      z: moveZ * speed * deltaSeconds,
    };

    // Use character controller to compute actual movement
    this.characterController.computeColliderMovement(
      collider,
      desiredMovement,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    );

    const correctedMovement = this.characterController.computedMovement();
    const currentPos = body.translation();

    // Debug: log occasionally
    const isGrounded = this.characterController.computedGrounded();
    const numCollisions = this.characterController.numComputedCollisions();
    if (Math.random() < 0.01) {
      console.log("[PhysicsWorld] Player update:", {
        desiredY: desiredMovement.y,
        correctedY: correctedMovement.y,
        isGrounded,
        numCollisions,
        currentY: currentPos.y,
      });
    }

    // Apply movement to kinematic body
    body.setNextKinematicTranslation({
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z,
    });

    // Apply rotation
    body.setNextKinematicRotation(
      this.yRotationToQuaternion(this.playerRotationY),
    );
  }

  private collectTransformUpdates(): TransformUpdateBatch["updates"] {
    const updates: TransformUpdateBatch["updates"] = [];

    for (const [id, body] of this.bodies) {
      const pos = body.translation();
      const rot = body.rotation();

      updates.push({
        id,
        position: { x: pos.x, y: pos.y, z: pos.z },
        rotation: { x: rot.x, y: rot.y, z: rot.z, w: rot.w },
      });
    }

    return updates;
  }

  dispose(): void {
    this.running = false;
    this.onUpdate = null;
    this.bodies.clear();
    this.colliders.clear();
    this.characterController = null;
    this.world = null;
    this.eventQueue = null;
  }
}
