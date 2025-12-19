import RAPIER from "@dimforge/rapier3d-compat";
import type {
  EntityId,
  Transform,
  PhysicsBodyConfig,
  FloatingCapsuleConfig,
  MovementInput,
} from "~/shared/types";
import type { SharedTransformBuffer } from "~/shared/buffers";
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

    // Get buffer index from shared buffer (already registered by main thread)
    sharedBuffer.rebuildEntityMap();
    const bufferIndex = sharedBuffer.getEntityIndex(id);
    this.entityIndices.set(id, bufferIndex);
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

    // Step the physics world
    this.world.step(this.eventQueue);

    // Write transforms to SharedArrayBuffer
    this.writeTransformsToSharedBuffer();

    // Write frame timing for interpolation (must be after transforms, before signal)
    this.sharedBuffer.writeFrameTiming(now, this.PHYSICS_INTERVAL);

    this.sharedBuffer.signalFrameComplete();

    // Schedule next step at 60Hz
    setTimeout(this.step, this.PHYSICS_INTERVAL);
  };

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
