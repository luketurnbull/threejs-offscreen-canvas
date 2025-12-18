import RAPIER from "@dimforge/rapier3d-compat";
import type {
  PhysicsApi,
  EntityId,
  Transform,
  PhysicsBodyConfig,
  CharacterControllerConfig,
  MovementInput,
  EntitySpawnData,
  SharedBuffers,
} from "~/shared/types";
import { SharedTransformBuffer } from "~/shared/buffers";

/**
 * PhysicsWorld - Rapier physics simulation
 *
 * Manages physics bodies, character controller, and simulation stepping.
 * Writes transforms to SharedArrayBuffer for zero-copy sync with Renderer.
 */
class PhysicsWorld {
  private world: RAPIER.World | null = null;
  private eventQueue: RAPIER.EventQueue | null = null;

  // Entity management
  private bodies: Map<EntityId, RAPIER.RigidBody> = new Map();
  private colliders: Map<EntityId, RAPIER.Collider> = new Map();
  private entityIndices: Map<EntityId, number> = new Map();

  // Shared buffer for transform sync
  private sharedBuffer!: SharedTransformBuffer;

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
  private readonly PHYSICS_INTERVAL = 1000 / 60; // 16.667ms for 60Hz

  async init(
    gravity: { x: number; y: number; z: number },
    sharedBuffer: SharedTransformBuffer,
  ): Promise<void> {
    this.sharedBuffer = sharedBuffer;

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

    // Get buffer index from shared buffer (already registered by main thread)
    this.sharedBuffer.rebuildEntityMap();
    const bufferIndex = this.sharedBuffer.getEntityIndex(entityId);
    this.entityIndices.set(entityId, bufferIndex);

    console.log("[PhysicsWorld] Spawned entity:", entityId, config.type);
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

    // Get buffer index from shared buffer (already registered by main thread)
    this.sharedBuffer.rebuildEntityMap();
    const bufferIndex = this.sharedBuffer.getEntityIndex(id);
    this.entityIndices.set(id, bufferIndex);

    // Initialize rotation from transform
    this.playerRotationY = this.quaternionToYRotation(transform.rotation);

    console.log("[PhysicsWorld] Spawned player:", id);
  }

  private quaternionToYRotation(q: {
    x: number;
    y: number;
    z: number;
    w: number;
  }): number {
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

  start(): void {
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

    const deltaSeconds = Math.min(deltaMs / 1000, 0.1);

    // Update player movement
    this.updatePlayer(deltaSeconds);

    // Step the physics world
    this.world.step(this.eventQueue!);

    // Write transforms to SharedArrayBuffer
    this.writeTransformsToSharedBuffer();

    // Write frame timing for interpolation (must be after transforms, before signal)
    this.sharedBuffer.writeFrameTiming(now, this.PHYSICS_INTERVAL);

    this.sharedBuffer.signalFrameComplete();

    // Schedule next step at 60Hz
    setTimeout(this.step, this.PHYSICS_INTERVAL);
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
      y: this.gravity * deltaSeconds,
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

  private writeTransformsToSharedBuffer(): void {
    for (const [id, body] of this.bodies) {
      const bufferIndex = this.entityIndices.get(id);
      if (bufferIndex === undefined || bufferIndex < 0) continue;

      const pos = body.translation();
      const rot = body.rotation();

      this.sharedBuffer.writeTransform(
        bufferIndex,
        pos.x,
        pos.y,
        pos.z,
        rot.x,
        rot.y,
        rot.z,
        rot.w,
      );
    }
  }

  dispose(): void {
    this.running = false;
    this.bodies.clear();
    this.colliders.clear();
    this.characterController = null;
    this.world = null;
    this.eventQueue = null;
  }
}

// ============================================
// API Factory (used by worker entry point)
// ============================================

let physicsWorld: PhysicsWorld | null = null;
let sharedBuffer: SharedTransformBuffer | null = null;

/**
 * Creates the PhysicsApi for Comlink exposure
 */
export function createPhysicsApi(): PhysicsApi {
  return {
    async init(
      gravity: { x: number; y: number; z: number },
      sharedBuffers: SharedBuffers,
    ): Promise<void> {
      sharedBuffer = new SharedTransformBuffer(
        sharedBuffers.control,
        sharedBuffers.transform,
        sharedBuffers.timing,
      );

      physicsWorld = new PhysicsWorld();
      await physicsWorld.init(gravity, sharedBuffer);
    },

    async spawnEntity(
      entity: EntitySpawnData,
      bodyConfig: PhysicsBodyConfig,
    ): Promise<void> {
      if (!physicsWorld) {
        throw new Error("Physics world not initialized");
      }
      physicsWorld.spawnEntity(entity.id, entity.transform, bodyConfig);
    },

    async spawnPlayer(
      id: EntityId,
      transform: Transform,
      config: CharacterControllerConfig,
    ): Promise<void> {
      if (!physicsWorld) {
        throw new Error("Physics world not initialized");
      }
      physicsWorld.spawnPlayer(id, transform, config);
    },

    removeEntity(id: EntityId): void {
      physicsWorld?.removeEntity(id);
    },

    setPlayerInput(input: MovementInput): void {
      physicsWorld?.setPlayerInput(input);
    },

    start(): void {
      if (!physicsWorld) {
        throw new Error("Physics world not initialized");
      }
      physicsWorld.start();
    },

    pause(): void {
      physicsWorld?.pause();
    },

    resume(): void {
      physicsWorld?.resume();
    },

    dispose(): void {
      physicsWorld?.dispose();
      physicsWorld = null;
    },
  };
}
