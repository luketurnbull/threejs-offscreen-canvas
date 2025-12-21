import type * as Comlink from "comlink";
import type {
  RenderApi,
  PhysicsApi,
  EntityId,
  Transform,
  DebugCollider,
} from "~/shared/types";
import { createEntityId } from "~/shared/types";
import type { SharedTransformBuffer } from "~/shared/buffers/transform-buffer";
import { config } from "~/shared/config";

/**
 * EntitySpawner - Manages entity creation across workers
 *
 * Single responsibility: Create and remove entities in both
 * physics and render workers with synchronized IDs.
 */
export default class EntitySpawner {
  private physicsApi: Comlink.Remote<PhysicsApi>;
  private renderApi: Comlink.Remote<RenderApi>;
  private sharedBuffer: SharedTransformBuffer;

  private playerId: EntityId | null = null;
  private cubeEntityIds: EntityId[] = [];

  constructor(
    physicsApi: Comlink.Remote<PhysicsApi>,
    renderApi: Comlink.Remote<RenderApi>,
    sharedBuffer: SharedTransformBuffer,
  ) {
    this.physicsApi = physicsApi;
    this.renderApi = renderApi;
    this.sharedBuffer = sharedBuffer;
  }

  /**
   * Spawn the initial world (ground + player + test objects)
   */
  async spawnWorld(): Promise<{ groundId: EntityId; playerId: EntityId }> {
    // Create terrain ground (heightfield physics + visual mesh)
    const groundId = createEntityId();
    const groundTransform: Transform = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    // Register ground in shared buffer
    this.sharedBuffer.registerEntity(groundId);

    // Spawn physics with heightfield collider
    await this.physicsApi.spawnEntity(
      { id: groundId, type: "static", transform: groundTransform },
      {
        type: "static",
        colliderType: "heightfield",
        dimensions: { x: config.terrain.size, y: 1, z: config.terrain.size },
        friction: 0.8,
      },
    );

    // Create player (character controller)
    this.playerId = createEntityId();
    const playerTransform: Transform = {
      position: { x: 0, y: 5, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    // Register player in shared buffer
    this.sharedBuffer.registerEntity(this.playerId);

    await this.physicsApi.spawnFloatingPlayer(
      this.playerId,
      playerTransform,
      {
        radius: config.floatingCapsule.radius,
        halfHeight: config.floatingCapsule.halfHeight,
        floatingDistance: config.floatingCapsule.floatingDistance,
        rayLength: config.floatingCapsule.rayLength,
        springStrength: config.floatingCapsule.springStrength,
        springDamping: config.floatingCapsule.springDamping,
        moveForce: config.floatingCapsule.moveForce,
        sprintMultiplier: config.floatingCapsule.sprintMultiplier,
        airControlMultiplier: config.floatingCapsule.airControlMultiplier,
        maxVelocity: config.floatingCapsule.maxVelocity,
        sprintMaxVelocity: config.floatingCapsule.sprintMaxVelocity,
        jumpForce: config.floatingCapsule.jumpForce,
        coyoteTime: config.floatingCapsule.coyoteTime,
        jumpBufferTime: config.floatingCapsule.jumpBufferTime,
        groundedThreshold: config.floatingCapsule.groundedThreshold,
        slopeLimit: config.floatingCapsule.slopeLimit,
        mass: config.floatingCapsule.mass,
        friction: config.floatingCapsule.friction,
        linearDamping: config.floatingCapsule.linearDamping,
        angularDamping: config.floatingCapsule.angularDamping,
      },
    );

    // Player debug collider for visualization
    const totalHalfHeight =
      config.floatingCapsule.halfHeight + config.floatingCapsule.radius;
    const playerDebugCollider: DebugCollider = {
      shape: {
        type: "capsule",
        radius: config.floatingCapsule.radius,
        halfHeight: config.floatingCapsule.halfHeight,
      },
      offset: { x: 0, y: totalHalfHeight, z: 0 },
    };

    // Spawn render entities
    await this.renderApi.spawnEntity(groundId, "ground");
    await this.renderApi.spawnEntity(
      this.playerId,
      "player",
      undefined,
      playerDebugCollider,
    );

    // Spawn test dynamic objects
    await this.spawnTestObjects();

    return { groundId, playerId: this.playerId };
  }

  /**
   * Spawn test dynamic objects to demonstrate physics sync
   */
  private async spawnTestObjects(): Promise<void> {
    // Spawn dynamic boxes
    await this.spawnDynamicBox(
      { x: 3, y: 6, z: 0 },
      { x: 1, y: 1, z: 1 },
      0x8b4513,
    );
    await this.spawnDynamicBox(
      { x: 3, y: 8, z: 0 },
      { x: 1, y: 1, z: 1 },
      0xa0522d,
    );
    await this.spawnDynamicBox(
      { x: 3, y: 10, z: 0 },
      { x: 1, y: 1, z: 1 },
      0xcd853f,
    );

    // Spawn dynamic spheres
    await this.spawnDynamicSphere({ x: -3, y: 7, z: 0 }, 0.5, 0x4169e1);
    await this.spawnDynamicSphere({ x: -3, y: 9, z: 1 }, 0.4, 0x1e90ff);
    await this.spawnDynamicSphere({ x: -3, y: 8, z: -1 }, 0.6, 0x00bfff);
  }

  /**
   * Spawn a dynamic box entity in both physics and render workers
   */
  async spawnDynamicBox(
    position: { x: number; y: number; z: number },
    size: { x: number; y: number; z: number } = { x: 1, y: 1, z: 1 },
    color: number = 0x8b4513,
  ): Promise<EntityId> {
    const id = createEntityId();
    const transform: Transform = {
      position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    // Register in shared buffer
    this.sharedBuffer.registerEntity(id);

    // Spawn physics body
    await this.physicsApi.spawnEntity(
      { id, type: "dynamic", transform },
      {
        type: "dynamic",
        colliderType: "cuboid",
        dimensions: size,
        mass: 1,
        friction: 0.5,
        restitution: 0.3,
      },
    );

    // Build debug collider for visualization
    const debugCollider: DebugCollider = {
      shape: {
        type: "cuboid",
        halfExtents: {
          x: size.x / 2,
          y: size.y / 2,
          z: size.z / 2,
        },
      },
    };

    // Spawn render entity
    await this.renderApi.spawnEntity(
      id,
      "dynamic-box",
      { size, color },
      debugCollider,
    );

    return id;
  }

  /**
   * Spawn a dynamic sphere entity in both physics and render workers
   */
  async spawnDynamicSphere(
    position: { x: number; y: number; z: number },
    radius: number = 0.5,
    color: number = 0x4169e1,
  ): Promise<EntityId> {
    const id = createEntityId();
    const transform: Transform = {
      position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    // Register in shared buffer
    this.sharedBuffer.registerEntity(id);

    // Spawn physics body
    await this.physicsApi.spawnEntity(
      { id, type: "dynamic", transform },
      {
        type: "dynamic",
        colliderType: "ball",
        dimensions: { x: radius * 2, y: radius * 2, z: radius * 2 },
        radius,
        mass: 1,
        friction: 0.3,
        restitution: 0.6,
      },
    );

    // Build debug collider for visualization
    const debugCollider: DebugCollider = {
      shape: {
        type: "ball",
        radius,
      },
    };

    // Spawn render entity
    await this.renderApi.spawnEntity(
      id,
      "dynamic-sphere",
      { radius, color },
      debugCollider,
    );

    return id;
  }

  /**
   * Spawn a storm of physics cubes for stress testing
   */
  async spawnCubeStorm(
    count: number,
    spawnArea: { width: number; height: number; depth: number } = {
      width: 20,
      height: 30,
      depth: 20,
    },
    cubeSize: number = 0.5,
  ): Promise<EntityId[]> {
    const entityIds: EntityId[] = [];
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const id = createEntityId();
      entityIds.push(id);

      // Random position in spawn area
      positions[i * 3] = (Math.random() - 0.5) * spawnArea.width;
      positions[i * 3 + 1] = 10 + Math.random() * spawnArea.height;
      positions[i * 3 + 2] = (Math.random() - 0.5) * spawnArea.depth;

      // Register in shared buffer
      this.sharedBuffer.registerEntity(id);
    }

    // Spawn physics bodies in batch
    await this.physicsApi.spawnCubes(entityIds, positions, cubeSize);

    // Spawn render instances
    await this.renderApi.spawnCubes(entityIds, cubeSize);

    // Track for cleanup
    this.cubeEntityIds.push(...entityIds);

    return entityIds;
  }

  /**
   * Clear all spawned cubes
   */
  async clearCubes(): Promise<void> {
    if (this.cubeEntityIds.length === 0) return;

    await this.physicsApi.removeCubes(this.cubeEntityIds);
    await this.renderApi.removeCubes(this.cubeEntityIds);

    this.cubeEntityIds = [];
  }

  /**
   * Get current cube count
   */
  getCubeCount(): number {
    return this.cubeEntityIds.length;
  }

  /**
   * Get the player entity ID
   */
  getPlayerId(): EntityId | null {
    return this.playerId;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.playerId = null;
    this.cubeEntityIds = [];
  }
}
