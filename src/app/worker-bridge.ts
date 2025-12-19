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
} from "~/shared/types";
import { createEntityId } from "~/shared/types";
import {
  SharedTransformBuffer,
  isSharedArrayBufferSupported,
} from "~/shared/buffers/transform-buffer";
import { config } from "~/shared/config";

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

  private playerId: EntityId | null = null;
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

    // Initialize both workers in parallel with shared buffers
    await Promise.all([
      this.initRenderWorker(canvas, viewport, debug, callbacks, buffers),
      this.initPhysicsWorker(buffers),
    ]);

    // Spawn initial entities BEFORE starting physics loop
    await this.spawnWorld();

    // Start physics simulation (transforms written directly to shared buffer)
    this.startPhysics();

    this._initialized = true;
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

    // Create ground plane (static physics body)
    const groundId = createEntityId();
    const groundTransform: Transform = {
      position: config.ground.position,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    // Register ground in shared buffer (main thread is the source of truth for entity IDs)
    this.sharedBuffer.registerEntity(groundId);

    await this.physicsApi.spawnEntity(
      { id: groundId, type: "static", transform: groundTransform },
      {
        type: "static",
        colliderType: "cuboid",
        dimensions: config.ground.dimensions,
        friction: 0.8,
      },
    );

    // Create player (character controller)
    this.playerId = createEntityId();
    const playerTransform: Transform = {
      position: { x: 0, y: 2, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    // Register player in shared buffer
    this.sharedBuffer.registerEntity(this.playerId);

    await this.physicsApi.spawnPlayer(this.playerId, playerTransform, {
      halfWidth: config.characterController.halfWidth,
      halfHeight: config.characterController.halfHeight,
      halfLength: config.characterController.halfLength,
      stepHeight: config.characterController.stepHeight,
      maxSlopeAngle: config.characterController.maxSlopeAngle,
      minSlopeSlideAngle: config.characterController.minSlopeSlideAngle,
    });

    // Build debug colliders for visualization
    const groundDebugCollider: DebugCollider = {
      shape: {
        type: "cuboid",
        halfExtents: {
          x: config.ground.dimensions.x / 2,
          y: config.ground.dimensions.y / 2,
          z: config.ground.dimensions.z / 2,
        },
      },
    };

    const playerDebugCollider: DebugCollider = {
      shape: {
        type: "cuboid",
        halfExtents: {
          x: config.characterController.halfWidth,
          y: config.characterController.halfHeight,
          z: config.characterController.halfLength,
        },
      },
      // Offset to match physics collider (body position = feet, collider raised)
      offset: { x: 0, y: config.characterController.halfHeight, z: 0 },
    };

    // Spawn render entities for ground and player
    await this.renderApi.spawnEntity(
      groundId,
      "ground",
      undefined,
      groundDebugCollider,
    );
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
    // Spawn a few dynamic boxes in a stack
    await this.spawnDynamicBox(
      { x: 3, y: 3, z: 0 },
      { x: 1, y: 1, z: 1 },
      0x8b4513,
    );
    await this.spawnDynamicBox(
      { x: 3, y: 5, z: 0 },
      { x: 1, y: 1, z: 1 },
      0xa0522d,
    );
    await this.spawnDynamicBox(
      { x: 3, y: 7, z: 0 },
      { x: 1, y: 1, z: 1 },
      0xcd853f,
    );

    // Spawn a few dynamic spheres
    await this.spawnDynamicSphere({ x: -3, y: 4, z: 0 }, 0.5, 0x4169e1);
    await this.spawnDynamicSphere({ x: -3, y: 6, z: 1 }, 0.4, 0x1e90ff);
    await this.spawnDynamicSphere({ x: -3, y: 8, z: -1 }, 0.6, 0x00bfff);
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
