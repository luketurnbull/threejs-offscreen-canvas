import * as Comlink from "comlink";
import type {
  RenderApi,
  PhysicsApi,
  ViewportSize,
  SerializedInputEvent,
  MovementInput,
  TransformUpdateBatch,
  EntityId,
  Transform,
} from "~/shared/types";
import { createEntityId } from "~/shared/types";

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
    // Initialize both workers in parallel
    await Promise.all([
      this.initRenderWorker(canvas, viewport, debug, callbacks),
      this.initPhysicsWorker(),
    ]);

    // Spawn initial entities BEFORE starting physics loop
    await this.spawnWorld();

    // Set up physics → render transform sync (starts the physics loop)
    this.setupTransformSync();

    this._initialized = true;
  }

  private async initRenderWorker(
    canvas: OffscreenCanvas,
    viewport: ViewportSize,
    debug: boolean,
    callbacks: WorkerBridgeCallbacks,
  ): Promise<void> {
    this.renderWorker = new Worker(
      new URL("../workers/render/index.ts", import.meta.url),
      { type: "module" },
    );

    this.renderApi = Comlink.wrap<RenderApi>(this.renderWorker);

    await this.renderApi.init(
      Comlink.transfer(canvas, [canvas]),
      viewport,
      debug,
      callbacks.onProgress ? Comlink.proxy(callbacks.onProgress) : undefined,
      callbacks.onReady ? Comlink.proxy(callbacks.onReady) : undefined,
      callbacks.onFrameTiming
        ? Comlink.proxy(callbacks.onFrameTiming)
        : undefined,
    );

    console.log("[WorkerBridge] Render worker initialized");
  }

  private async initPhysicsWorker(): Promise<void> {
    this.physicsWorker = new Worker(
      new URL("../workers/physics/index.ts", import.meta.url),
      { type: "module" },
    );

    this.physicsApi = Comlink.wrap<PhysicsApi>(this.physicsWorker);

    await this.physicsApi.init({ x: 0, y: -20, z: 0 });

    console.log("[WorkerBridge] Physics worker initialized");
  }

  private setupTransformSync(): void {
    if (!this.physicsApi || !this.renderApi) return;

    // Start physics simulation with transform update callback
    const renderApi = this.renderApi;
    this.physicsApi.start(
      Comlink.proxy((updates: TransformUpdateBatch) => {
        // Forward transform updates from physics to render
        renderApi.applyTransformUpdates(updates);
      }),
    );

    console.log("[WorkerBridge] Transform sync established");
  }

  private async spawnWorld(): Promise<void> {
    if (!this.physicsApi || !this.renderApi) return;

    // Create ground plane (static physics body)
    const groundId = createEntityId();
    const groundTransform: Transform = {
      position: { x: 0, y: -0.5, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    await this.physicsApi.spawnEntity(
      { id: groundId, type: "static", transform: groundTransform },
      {
        type: "static",
        colliderType: "cuboid",
        dimensions: { x: 100, y: 1, z: 100 },
        friction: 0.8,
      },
    );

    // Create player (character controller)
    this.playerId = createEntityId();
    const playerTransform: Transform = {
      position: { x: 0, y: 1, z: 0 },
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
    };

    await this.physicsApi.spawnPlayer(this.playerId, playerTransform, {
      capsuleRadius: 0.3,
      capsuleHeight: 1.0,
      stepHeight: 0.3,
      maxSlopeAngle: 45,
      minSlopeSlideAngle: 30,
    });

    // Spawn render entities for ground and player
    await this.renderApi.spawnEntity(groundId, "ground");
    await this.renderApi.spawnEntity(this.playerId, "player");

    console.log("[WorkerBridge] World spawned");
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
