import RAPIER from "@dimforge/rapier3d-compat";
import type {
  EntityId,
  Transform,
  PhysicsBodyConfig,
  FloatingCapsuleConfig,
  MovementInput,
  CollisionCallback,
  PlayerStateCallback,
  BatchBodyConfig,
} from "~/shared/types";
import type {
  DebugPhysicsUpdate,
  DebugPlayerUpdate,
} from "~/shared/debug-config";
import { type SharedTransformBuffer, EntityFlags } from "~/shared/buffers";
import { config } from "~/shared/config";
import { generateTerrainHeights } from "~/shared/utils";
import FloatingCapsuleController from "./floating-capsule-controller";

/**
 * PhysicsWorld - Rapier physics simulation
 *
 * Manages physics bodies, character controller, and simulation stepping.
 * Writes transforms to SharedArrayBuffer for zero-copy sync with Renderer.
 */
export default class PhysicsWorld {
  private world: RAPIER.World | null = null;
  private eventQueue: RAPIER.EventQueue | null = null;
  private sharedBuffer: SharedTransformBuffer | null = null;
  private initialized = false;

  // Entity management
  private bodies: Map<EntityId, RAPIER.RigidBody> = new Map();
  private colliders: Map<EntityId, RAPIER.Collider> = new Map();
  private entityIndices: Map<EntityId, number> = new Map();

  // Floating capsule controller (dynamic rigidbody-based)
  private floatingController: FloatingCapsuleController | null = null;
  private playerId: EntityId | null = null;

  // Simulation loop
  private running = false;
  private lastTime = 0;
  private readonly PHYSICS_INTERVAL = config.physics.interval;

  // Audio callbacks
  private collisionCallback: CollisionCallback | null = null;
  private playerStateCallback: PlayerStateCallback | null = null;

  // Collision cooldown to prevent spam (entityA-entityB -> last collision time)
  private collisionCooldowns: Map<string, number> = new Map();
  private readonly COLLISION_COOLDOWN_MS = 350; // High value to filter rolling contacts

  // Per-frame collision limit to prevent audio overload
  private readonly MAX_COLLISIONS_PER_FRAME = 12;

  // Mutable physics config (can be changed via debug UI)
  private mutableConfig: { density: number; gravity: number } = {
    density: config.physics.density,
    gravity: config.physics.gravity.y,
  };

  async init(
    gravity: { x: number; y: number; z: number },
    sharedBuffer: SharedTransformBuffer,
    onProgress?: (progress: number) => void,
  ): Promise<void> {
    this.sharedBuffer = sharedBuffer;

    // Initialize Rapier WASM
    onProgress?.(0);
    await RAPIER.init();
    onProgress?.(1);

    // Create physics world
    this.world = new RAPIER.World(gravity);

    // Create event queue for collision events
    this.eventQueue = new RAPIER.EventQueue(true);

    this.initialized = true;
  }

  /**
   * Check if the physics world has been initialized and throw if not
   */
  private ensureInitialized(): {
    world: RAPIER.World;
    sharedBuffer: SharedTransformBuffer;
    eventQueue: RAPIER.EventQueue;
  } {
    if (
      !this.initialized ||
      !this.world ||
      !this.sharedBuffer ||
      !this.eventQueue
    ) {
      throw new Error("PhysicsWorld not initialized - call init() first");
    }
    return {
      world: this.world,
      sharedBuffer: this.sharedBuffer,
      eventQueue: this.eventQueue,
    };
  }

  spawnEntity(
    entityId: EntityId,
    transform: Transform,
    bodyConfig: PhysicsBodyConfig,
  ): void {
    const { world, sharedBuffer } = this.ensureInitialized();

    // Create rigid body descriptor
    let bodyDesc: RAPIER.RigidBodyDesc;
    switch (bodyConfig.type) {
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
    const body = world.createRigidBody(bodyDesc);

    // Create collider
    let colliderDesc: RAPIER.ColliderDesc;
    switch (bodyConfig.colliderType) {
      case "cuboid":
        colliderDesc = RAPIER.ColliderDesc.cuboid(
          bodyConfig.dimensions.x / 2,
          bodyConfig.dimensions.y / 2,
          bodyConfig.dimensions.z / 2,
        );
        break;
      case "ball":
        colliderDesc = RAPIER.ColliderDesc.ball(bodyConfig.radius ?? 0.5);
        break;
      case "capsule":
        colliderDesc = RAPIER.ColliderDesc.capsule(
          (bodyConfig.height ?? 1) / 2,
          bodyConfig.radius ?? 0.5,
        );
        break;
      case "heightfield": {
        // Generate terrain heights deterministically from config
        const terrainConfig = config.terrain;
        const heights = generateTerrainHeights(terrainConfig);

        // Rapier heightfield API:
        // - nrows/ncols = number of subdivisions (segments)
        // - heights array = (nrows+1) * (ncols+1) elements
        // - scale = Vector for X-Z plane dimensions
        const nrows = terrainConfig.segments;
        const ncols = terrainConfig.segments;

        // Create scale vector using Rapier's Vector type
        const scale = new RAPIER.Vector3(
          terrainConfig.size,
          1,
          terrainConfig.size,
        );

        colliderDesc = RAPIER.ColliderDesc.heightfield(
          nrows,
          ncols,
          heights,
          scale,
        );
        break;
      }
      default:
        colliderDesc = RAPIER.ColliderDesc.cuboid(
          bodyConfig.dimensions.x / 2,
          bodyConfig.dimensions.y / 2,
          bodyConfig.dimensions.z / 2,
        );
    }

    // Set physics properties
    if (bodyConfig.friction !== undefined) {
      colliderDesc.setFriction(bodyConfig.friction);
    }
    if (bodyConfig.restitution !== undefined) {
      colliderDesc.setRestitution(bodyConfig.restitution);
    }

    const collider = world.createCollider(colliderDesc, body);

    // Enable collision events for dynamic bodies (for audio)
    if (bodyConfig.type === "dynamic") {
      collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
    }

    // Store references
    this.bodies.set(entityId, body);
    this.colliders.set(entityId, collider);

    // Get buffer index from shared buffer (already registered by main thread)
    sharedBuffer.rebuildEntityMap();
    const bufferIndex = sharedBuffer.getEntityIndex(entityId);
    this.entityIndices.set(entityId, bufferIndex);
  }

  spawnFloatingPlayer(
    id: EntityId,
    transform: Transform,
    controllerConfig: FloatingCapsuleConfig,
  ): void {
    const { world, sharedBuffer } = this.ensureInitialized();

    // Create floating capsule controller (dynamic rigidbody-based)
    this.floatingController = new FloatingCapsuleController(
      world,
      id,
      transform,
      controllerConfig,
    );

    // Store references from the floating controller
    this.bodies.set(id, this.floatingController.getBody());
    this.colliders.set(id, this.floatingController.getCollider());
    this.playerId = id;

    // Pass stored player state callback if it was set before player was created
    if (this.playerStateCallback) {
      this.floatingController.setPlayerStateCallback(this.playerStateCallback);
    }

    // Get buffer index from shared buffer (already registered by main thread)
    sharedBuffer.rebuildEntityMap();
    const bufferIndex = sharedBuffer.getEntityIndex(id);
    this.entityIndices.set(id, bufferIndex);
  }

  /**
   * Spawn multiple physics bodies at once (boxes or spheres)
   * Entity IDs must already be registered in the shared buffer
   * @param sizes Per-entity sizes: boxes = 3 floats (x,y,z), spheres = 1 float (radius)
   * @param velocities Optional initial velocities (3 floats per entity: vx, vy, vz)
   */
  spawnBodies(
    entityIds: EntityId[],
    positions: Float32Array,
    bodyConfig: BatchBodyConfig,
    sizes: Float32Array,
    velocities?: Float32Array,
  ): void {
    const { world, sharedBuffer } = this.ensureInitialized();

    // Rebuild entity map to see IDs registered by main thread
    sharedBuffer.rebuildEntityMap();

    const count = entityIds.length;
    const density = this.mutableConfig.density;

    for (let i = 0; i < count; i++) {
      const id = entityIds[i];
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];

      // Check if this body has initial velocity (projectile)
      const hasVelocity = velocities !== undefined;

      // Create dynamic rigid body with CCD enabled for projectiles
      const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setLinearDamping(0.1)
        .setAngularDamping(0.1)
        .setCcdEnabled(hasVelocity); // Enable CCD for fast-moving projectiles

      const body = world.createRigidBody(bodyDesc);

      // Apply initial velocity if provided
      if (velocities) {
        const vx = velocities[i * 3];
        const vy = velocities[i * 3 + 1];
        const vz = velocities[i * 3 + 2];
        body.setLinvel({ x: vx, y: vy, z: vz }, true);
      }

      // Create collider based on type with per-entity sizes
      let colliderDesc: RAPIER.ColliderDesc;

      if (bodyConfig.type === "sphere") {
        // Spheres: 1 float per entity (radius)
        const radius = sizes[i];
        colliderDesc = RAPIER.ColliderDesc.ball(radius)
          .setDensity(density)
          .setFriction(0.3)
          .setRestitution(0.6);
      } else {
        // Boxes: 3 floats per entity (x, y, z dimensions)
        const hx = sizes[i * 3] / 2;
        const hy = sizes[i * 3 + 1] / 2;
        const hz = sizes[i * 3 + 2] / 2;
        colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setDensity(density)
          .setFriction(0.5)
          .setRestitution(0.3);
      }

      const collider = world.createCollider(colliderDesc, body);

      // Enable collision events for audio
      collider.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);

      // Store references
      this.bodies.set(id, body);
      this.colliders.set(id, collider);

      // Get buffer index from shared buffer
      const bufferIndex = sharedBuffer.getEntityIndex(id);
      this.entityIndices.set(id, bufferIndex);
    }
  }

  /**
   * Remove multiple physics bodies at once
   */
  removeBodies(entityIds: EntityId[]): void {
    for (const id of entityIds) {
      this.removeEntity(id);
    }
  }

  removeEntity(id: EntityId): void {
    if (!this.world) return;

    const body = this.bodies.get(id);
    if (body) {
      this.world.removeRigidBody(body);
      this.bodies.delete(id);
      this.colliders.delete(id);
      this.entityIndices.delete(id);
    }

    if (this.playerId === id) {
      this.playerId = null;
      this.floatingController = null;
    }
  }

  setPlayerInput(input: MovementInput): void {
    this.floatingController?.setInput(input);
  }

  /**
   * Update physics config (density, gravity) from debug UI
   */
  updatePhysicsConfig(update: DebugPhysicsUpdate): void {
    if (update.density !== undefined) {
      this.mutableConfig.density = update.density;
    }
    if (update.gravity !== undefined) {
      this.mutableConfig.gravity = update.gravity;
      // Apply gravity change to world immediately
      if (this.world) {
        this.world.gravity = { x: 0, y: update.gravity, z: 0 };
      }
    }
  }

  /**
   * Update player controller config from debug UI
   */
  updatePlayerConfig(update: DebugPlayerUpdate): void {
    this.floatingController?.updateConfig(update);
  }

  /**
   * Set callback for collision events (for audio)
   */
  setCollisionCallback(callback: CollisionCallback): void {
    this.collisionCallback = callback;
  }

  /**
   * Set callback for player state events (jump/land)
   * Stores callback and passes to floating controller if it exists
   */
  setPlayerStateCallback(callback: PlayerStateCallback): void {
    this.playerStateCallback = callback;
    // Pass to floating controller if it exists
    this.floatingController?.setPlayerStateCallback(callback);
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
    if (!this.running || !this.world || !this.sharedBuffer || !this.eventQueue)
      return;

    const now = performance.now();
    const deltaMs = now - this.lastTime;
    this.lastTime = now;

    const deltaSeconds = Math.min(deltaMs / 1000, 0.1);

    // Update player movement via floating capsule controller
    this.floatingController?.update(deltaSeconds);

    // Write player grounded state to flags buffer for animation
    if (this.floatingController && this.playerId !== null) {
      const playerIndex = this.entityIndices.get(this.playerId);
      if (playerIndex !== undefined) {
        const flags = this.floatingController.getIsGrounded()
          ? EntityFlags.GROUNDED
          : 0;
        this.sharedBuffer.writeEntityFlags(playerIndex, flags);
      }
    }

    // Step the physics world
    this.world.step(this.eventQueue);

    // Drain collision events for audio
    this.drainCollisionEvents();

    // Write transforms to SharedArrayBuffer
    this.writeTransformsToSharedBuffer();

    // Write frame timing for interpolation (must be after transforms, before signal)
    this.sharedBuffer.writeFrameTiming(now, this.PHYSICS_INTERVAL);

    this.sharedBuffer.signalFrameComplete();

    // Schedule next step at 60Hz
    setTimeout(this.step, this.PHYSICS_INTERVAL);
  };

  /**
   * Drain collision events from the event queue and emit audio events
   *
   * Key improvements:
   * - Uses vertical velocity for ground collisions (filters out rolling)
   * - Per-frame collision limit prevents audio overload with mass spawns
   * - Increased cooldown reduces spam from continuous contact
   */
  private drainCollisionEvents(): void {
    if (!this.collisionCallback || !this.eventQueue || !this.world) return;

    const now = performance.now();
    let collisionsThisFrame = 0;

    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      // Only process collision start events
      if (!started) return;

      // Limit collisions per frame to prevent audio overload
      if (collisionsThisFrame >= this.MAX_COLLISIONS_PER_FRAME) return;

      const collider1 = this.world!.getCollider(handle1);
      const collider2 = this.world!.getCollider(handle2);

      if (!collider1 || !collider2) return;

      // Get entity IDs from our collider map
      const entityA = this.getEntityIdFromCollider(collider1);
      const entityB = this.getEntityIdFromCollider(collider2);

      // Skip if BOTH entities are unknown (neither is tracked)
      // This allows ground collisions where one entity is known and ground is null
      if (entityA === null && entityB === null) return;

      // Skip player collisions (player has its own audio events)
      if (entityA === this.playerId || entityB === this.playerId) return;

      // Check cooldown to prevent rapid repeated collisions
      // Use a string representation that handles null values
      const idA = entityA ?? "ground";
      const idB = entityB ?? "ground";
      const pairKey = idA < idB ? `${idA}-${idB}` : `${idB}-${idA}`;
      const lastCollision = this.collisionCooldowns.get(pairKey);
      if (lastCollision && now - lastCollision < this.COLLISION_COOLDOWN_MS) {
        return;
      }

      // Get collision position (midpoint of the two colliders)
      const pos1 = collider1.translation();
      const pos2 = collider2.translation();

      // Get bodies for velocity calculation
      const body1 = collider1.parent();
      const body2 = collider2.parent();

      let impulse = 1.0;
      const isGroundCollision = entityA === null || entityB === null;

      if (isGroundCollision) {
        // Ground collision: use VERTICAL velocity as impulse metric
        // Rolling objects have low vertical velocity, impacts have high vertical velocity
        // This filters out the constant noise from spheres rolling on terrain
        const dynamicBody = entityA === null ? body2 : body1;
        if (dynamicBody) {
          const vel = dynamicBody.linvel();
          impulse = Math.abs(vel.y);
        }
      } else {
        // Object-object collision: use relative velocity magnitude
        if (body1 && body2) {
          const vel1 = body1.linvel();
          const vel2 = body2.linvel();
          const relVel = Math.sqrt(
            Math.pow(vel1.x - vel2.x, 2) +
              Math.pow(vel1.y - vel2.y, 2) +
              Math.pow(vel1.z - vel2.z, 2),
          );
          impulse = relVel;
        }
      }

      // Filter out weak collisions (rolling, gentle bumps)
      if (impulse < config.audio.collisions.minImpulse) return;

      // Update cooldown and emit event
      this.collisionCooldowns.set(pairKey, now);
      collisionsThisFrame++;

      this.collisionCallback!({
        type: "collision",
        entityA,
        entityB,
        position: {
          x: (pos1.x + pos2.x) / 2,
          y: (pos1.y + pos2.y) / 2,
          z: (pos1.z + pos2.z) / 2,
        },
        impulse,
      });
    });
  }

  /**
   * Get entity ID from a collider (reverse lookup)
   */
  private getEntityIdFromCollider(collider: RAPIER.Collider): EntityId | null {
    for (const [entityId, storedCollider] of this.colliders) {
      if (storedCollider.handle === collider.handle) {
        return entityId;
      }
    }
    return null;
  }

  private writeTransformsToSharedBuffer(): void {
    if (!this.sharedBuffer) return;

    for (const [id, body] of this.bodies) {
      const bufferIndex = this.entityIndices.get(id);

      // Validate entity is registered before writing
      if (bufferIndex === undefined) {
        console.error(
          `[PhysicsWorld.writeTransformsToSharedBuffer] Entity ${id} not found in entity indices. ` +
            `This indicates a registration bug - entity was added to physics but not registered in shared buffer. ` +
            `Skipping transform write.`,
        );
        continue;
      }

      // Validate buffer index is valid
      const validation = this.sharedBuffer.validateIndex(bufferIndex);
      if (!validation.success) {
        console.error(
          `[PhysicsWorld.writeTransformsToSharedBuffer] Entity ${id} has invalid buffer index ${bufferIndex}: ` +
            `${validation.error}. Skipping transform write.`,
        );
        continue;
      }

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
    this.entityIndices.clear();
    this.floatingController = null;
    this.playerId = null;
    this.world = null;
    this.eventQueue = null;
    this.sharedBuffer = null;
    this.initialized = false;
  }
}
