import * as Comlink from "comlink";
import type {
  RenderApi,
  PhysicsApi,
  ViewportSize,
  SerializedInputEvent,
  MovementInput,
  EntityId,
  Transform,
  DebugCollider,
  CollisionEvent,
  JumpEvent,
  LandEvent,
  FootstepEvent,
  ListenerUpdate,
} from "~/shared/types";
import { createEntityId } from "~/shared/types";
import {
  SharedTransformBuffer,
  isSharedArrayBufferSupported,
} from "~/shared/buffers/transform-buffer";
import { config } from "~/shared/config";
import AudioManager from "./audio-manager";

export interface WorkerBridgeCallbacks {
  onProgress?: (progress: number) => void;
  onReady?: () => void;
  onFrameTiming?: (deltaMs: number) => void;
}

/**
 * WorkerBridge - Coordinates communication between workers
 *
 * Main thread orchestrator that:
 * - Manages both Physics and Render workers
 * - Routes transform updates from Physics → Render
 * - Converts input events to physics movement commands
 * - Manages entity lifecycle across workers
 */
export default class WorkerBridge {
  private renderWorker: Worker | null = null;
  private physicsWorker: Worker | null = null;

  private renderApi: Comlink.Remote<RenderApi> | null = null;
  private physicsApi: Comlink.Remote<PhysicsApi> | null = null;

  private sharedBuffer!: SharedTransformBuffer;
  private audioManager: AudioManager;

  private playerId: EntityId | null = null;
  private cubeEntityIds: EntityId[] = [];

  private currentInput: MovementInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
  };

  private _initialized = false;

  get initialized(): boolean {
    return this._initialized;
  }

  constructor() {
    this.audioManager = new AudioManager();
  }

  async init(
    canvas: OffscreenCanvas,
    viewport: ViewportSize,
    debug: boolean,
    callbacks: WorkerBridgeCallbacks,
  ): Promise<void> {
    // SharedArrayBuffer is required - no fallback
    if (!isSharedArrayBufferSupported()) {
      throw new Error(
        "SharedArrayBuffer is not supported. " +
          "Please use a modern browser with cross-origin isolation enabled.",
      );
    }

    // Create shared buffer for zero-copy transform sync
    this.sharedBuffer = new SharedTransformBuffer();
    const buffers = this.sharedBuffer.getBuffers();

    // Initialize audio manager, render worker, and physics worker in parallel
    await Promise.all([
      this.audioManager.init(),
      this.initRenderWorker(canvas, viewport, debug, callbacks, buffers),
      this.initPhysicsWorker(buffers),
    ]);

    // Set up audio callbacks after workers are initialized
    this.setupAudioCallbacks();

    // Spawn initial entities BEFORE starting physics loop
    await this.spawnWorld();

    // Start physics simulation (transforms written directly to shared buffer)
    this.startPhysics();

    // Audio unlock is handled by loading screen start button (unlockAudio method)

    this._initialized = true;
  }

  /**
   * Set up audio callbacks from workers
   */
  private setupAudioCallbacks(): void {
    if (!this.physicsApi || !this.renderApi) return;

    // Physics worker callbacks
    this.physicsApi.setCollisionCallback(
      Comlink.proxy((event: CollisionEvent) => {
        this.audioManager.onCollision(event);
      }),
    );

    this.physicsApi.setPlayerStateCallback(
      Comlink.proxy((event: JumpEvent | LandEvent) => {
        if (event.type === "jump") {
          this.audioManager.onJump(event);
        } else {
          this.audioManager.onLand(event);
        }
      }),
    );

    // Render worker callbacks
    this.renderApi.setFootstepCallback(
      Comlink.proxy((event: FootstepEvent) => {
        this.audioManager.onFootstep(event);
      }),
    );

    this.renderApi.setListenerCallback(
      Comlink.proxy((update: ListenerUpdate) => {
        this.audioManager.updateListener(update);
      }),
    );
  }

  /**
   * Unlock audio (called from loading screen start button)
   * This satisfies the browser's autoplay policy requirement for user gesture
   */
  async unlockAudio(): Promise<void> {
    await this.audioManager.resume();
  }

  private async initRenderWorker(
    canvas: OffscreenCanvas,
    viewport: ViewportSize,
    debug: boolean,
    callbacks: WorkerBridgeCallbacks,
    sharedBuffers: {
      control: SharedArrayBuffer;
      transform: SharedArrayBuffer;
      timing: SharedArrayBuffer;
    },
  ): Promise<void> {
    this.renderWorker = new Worker(
      new URL("../workers/render.worker.ts", import.meta.url),
      { type: "module" },
    );

    this.renderApi = Comlink.wrap<RenderApi>(this.renderWorker);

    await this.renderApi.init(
      Comlink.transfer(canvas, [canvas]),
      viewport,
      debug,
      sharedBuffers,
      callbacks.onProgress ? Comlink.proxy(callbacks.onProgress) : undefined,
      callbacks.onReady ? Comlink.proxy(callbacks.onReady) : undefined,
      callbacks.onFrameTiming
        ? Comlink.proxy(callbacks.onFrameTiming)
        : undefined,
    );
  }

  private async initPhysicsWorker(sharedBuffers: {
    control: SharedArrayBuffer;
    transform: SharedArrayBuffer;
    timing: SharedArrayBuffer;
  }): Promise<void> {
    this.physicsWorker = new Worker(
      new URL("../workers/physics.worker.ts", import.meta.url),
      { type: "module" },
    );

    this.physicsApi = Comlink.wrap<PhysicsApi>(this.physicsWorker);

    await this.physicsApi.init(config.physics.gravity, sharedBuffers);
  }

  private startPhysics(): void {
    if (!this.physicsApi) return;

    // Start physics simulation - transforms are written directly to SharedArrayBuffer
    this.physicsApi.start();
  }

  /**
   * Spawn a dynamic box entity in both physics and render workers
   */
  async spawnDynamicBox(
    position: { x: number; y: number; z: number },
    size: { x: number; y: number; z: number } = { x: 1, y: 1, z: 1 },
    color: number = 0x8b4513,
  ): Promise<EntityId> {
    if (!this.physicsApi || !this.renderApi) {
      throw new Error("Workers not initialized");
    }

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
    if (!this.physicsApi || !this.renderApi) {
      throw new Error("Workers not initialized");
    }

    const id = createEntityId();
    const transform: Transform = {
      position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    // Register in shared buffer
    this.sharedBuffer.registerEntity(id);

    // Spawn physics body (use ball collider)
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

  private async spawnWorld(): Promise<void> {
    if (!this.physicsApi || !this.renderApi) return;

    // Create terrain ground (heightfield physics + visual mesh)
    const groundId = createEntityId();
    const groundTransform: Transform = {
      position: { x: 0, y: 0, z: 0 }, // Heightfield is centered at origin
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    // Register ground in shared buffer (main thread is the source of truth for entity IDs)
    this.sharedBuffer.registerEntity(groundId);

    // Spawn physics with heightfield collider (terrain)
    await this.physicsApi.spawnEntity(
      { id: groundId, type: "static", transform: groundTransform },
      {
        type: "static",
        colliderType: "heightfield",
        dimensions: { x: config.terrain.size, y: 1, z: config.terrain.size },
        friction: 0.8,
      },
    );

    // Create player (character controller) - spawn higher to account for terrain
    this.playerId = createEntityId();
    const playerTransform: Transform = {
      position: { x: 0, y: 5, z: 0 }, // Spawn higher, will fall to terrain
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    // Register player in shared buffer
    this.sharedBuffer.registerEntity(this.playerId);

    await this.physicsApi.spawnFloatingPlayer(this.playerId, playerTransform, {
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
    });

    // Player debug collider for visualization (capsule)
    const totalHalfHeight =
      config.floatingCapsule.halfHeight + config.floatingCapsule.radius;
    const playerDebugCollider: DebugCollider = {
      shape: {
        type: "capsule",
        radius: config.floatingCapsule.radius,
        halfHeight: config.floatingCapsule.halfHeight,
      },
      // Offset to match physics collider (body position = feet, collider raised)
      offset: { x: 0, y: totalHalfHeight, z: 0 },
    };

    // Spawn render entities for ground and player
    // Note: Ground has no debug collider (heightfield visualization is complex)
    await this.renderApi.spawnEntity(groundId, "ground");
    await this.renderApi.spawnEntity(
      this.playerId,
      "player",
      undefined,
      playerDebugCollider,
    );

    // Spawn test dynamic objects to verify physics sync
    await this.spawnTestObjects();
  }

  /**
   * Spawn test dynamic objects to demonstrate physics sync
   */
  private async spawnTestObjects(): Promise<void> {
    // Spawn a few dynamic boxes - higher Y to account for terrain height
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

    // Spawn a few dynamic spheres - higher Y to account for terrain height
    await this.spawnDynamicSphere({ x: -3, y: 7, z: 0 }, 0.5, 0x4169e1);
    await this.spawnDynamicSphere({ x: -3, y: 9, z: 1 }, 0.4, 0x1e90ff);
    await this.spawnDynamicSphere({ x: -3, y: 8, z: -1 }, 0.6, 0x00bfff);
  }

  /**
   * Spawn a storm of physics cubes for stress testing
   * Uses InstancedMesh for efficient rendering
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
    if (!this.physicsApi || !this.renderApi) {
      throw new Error("Workers not initialized");
    }

    // Generate entity IDs and positions
    const entityIds: EntityId[] = [];
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const id = createEntityId();
      entityIds.push(id);

      // Random position in spawn area, centered above origin
      positions[i * 3] = (Math.random() - 0.5) * spawnArea.width;
      positions[i * 3 + 1] = 10 + Math.random() * spawnArea.height; // Above ground
      positions[i * 3 + 2] = (Math.random() - 0.5) * spawnArea.depth;

      // Register in shared buffer (main thread is source of truth)
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
    if (!this.physicsApi || !this.renderApi) return;
    if (this.cubeEntityIds.length === 0) return;

    // Remove from physics
    await this.physicsApi.removeCubes(this.cubeEntityIds);

    // Remove from render
    await this.renderApi.removeCubes(this.cubeEntityIds);

    // Clear tracking
    this.cubeEntityIds = [];
  }

  /**
   * Get current cube count
   */
  getCubeCount(): number {
    return this.cubeEntityIds.length;
  }

  resize(viewport: ViewportSize): void {
    this.renderApi?.resize(viewport);
  }

  handleInput(event: SerializedInputEvent): void {
    // Forward to render for camera/UI interaction
    this.renderApi?.handleInput(event);

    // Convert keyboard events to movement input for physics
    if (event.type === "keydown" || event.type === "keyup") {
      const pressed = event.type === "keydown";
      const key = event.key.toLowerCase();

      let inputChanged = false;

      switch (key) {
        case "w":
          this.currentInput.forward = pressed;
          inputChanged = true;
          break;
        case "s":
          this.currentInput.backward = pressed;
          inputChanged = true;
          break;
        case "a":
          this.currentInput.left = pressed;
          inputChanged = true;
          break;
        case "d":
          this.currentInput.right = pressed;
          inputChanged = true;
          break;
        case " ":
          this.currentInput.jump = pressed;
          inputChanged = true;
          break;
        case "shift":
          this.currentInput.sprint = pressed;
          inputChanged = true;
          break;
      }

      if (inputChanged && this.physicsApi) {
        this.physicsApi.setPlayerInput({ ...this.currentInput });
      }
    }
  }

  getRenderApi(): Comlink.Remote<RenderApi> | null {
    return this.renderApi;
  }

  getPhysicsApi(): Comlink.Remote<PhysicsApi> | null {
    return this.physicsApi;
  }

  dispose(): void {
    this.physicsApi?.dispose();
    this.renderApi?.dispose();
    this.audioManager.dispose();

    this.physicsWorker?.terminate();
    this.renderWorker?.terminate();

    this.physicsWorker = null;
    this.renderWorker = null;
    this.physicsApi = null;
    this.renderApi = null;
    this.playerId = null;
    this._initialized = false;
  }
}
