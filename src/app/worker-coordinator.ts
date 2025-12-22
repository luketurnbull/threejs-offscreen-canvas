import * as Comlink from "comlink";
import type { RenderApi, PhysicsApi, ViewportSize } from "~/shared/types";
import {
  SharedTransformBuffer,
  isSharedArrayBufferSupported,
} from "~/shared/buffers/transform-buffer";
import { config } from "~/shared/config";

export interface WorkerCallbacks {
  onProgress?: (progress: number) => void;
  onReady?: () => void;
  onFrameTiming?: (deltaMs: number) => void;
}

/**
 * WorkerCoordinator - Manages worker lifecycle
 *
 * Single responsibility: Create, initialize, and dispose of workers.
 * Does NOT handle entity spawning, input routing, or audio.
 */
export default class WorkerCoordinator {
  private renderWorker: Worker | null = null;
  private physicsWorker: Worker | null = null;
  private renderApi: Comlink.Remote<RenderApi> | null = null;
  private physicsApi: Comlink.Remote<PhysicsApi> | null = null;
  private sharedBuffer: SharedTransformBuffer | null = null;

  /**
   * Initialize both workers with shared buffers
   */
  async init(
    canvas: OffscreenCanvas,
    viewport: ViewportSize,
    debug: boolean,
    callbacks: WorkerCallbacks,
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

    // Initialize render worker and physics worker in parallel
    await Promise.all([
      this.initRenderWorker(canvas, viewport, debug, callbacks, buffers),
      this.initPhysicsWorker(buffers),
    ]);
  }

  private async initRenderWorker(
    canvas: OffscreenCanvas,
    viewport: ViewportSize,
    debug: boolean,
    callbacks: WorkerCallbacks,
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

  /**
   * Get the Render worker API
   */
  getRenderApi(): Comlink.Remote<RenderApi> {
    if (!this.renderApi) {
      throw new Error("WorkerCoordinator not initialized");
    }
    return this.renderApi;
  }

  /**
   * Get the Physics worker API
   */
  getPhysicsApi(): Comlink.Remote<PhysicsApi> {
    if (!this.physicsApi) {
      throw new Error("WorkerCoordinator not initialized");
    }
    return this.physicsApi;
  }

  /**
   * Get the shared transform buffer
   */
  getSharedBuffer(): SharedTransformBuffer {
    if (!this.sharedBuffer) {
      throw new Error("WorkerCoordinator not initialized");
    }
    return this.sharedBuffer;
  }

  /**
   * Start physics simulation
   */
  startPhysics(): void {
    if (!this.physicsApi) {
      throw new Error("WorkerCoordinator not initialized");
    }
    this.physicsApi.start();
  }

  /**
   * Resize the render viewport
   */
  resize(viewport: ViewportSize): void {
    this.renderApi?.resize(viewport);
  }

  /**
   * Dispose of all workers and resources
   */
  dispose(): void {
    this.physicsApi?.dispose();
    this.renderApi?.dispose();

    this.physicsWorker?.terminate();
    this.renderWorker?.terminate();

    this.physicsWorker = null;
    this.renderWorker = null;
    this.physicsApi = null;
    this.renderApi = null;
    this.sharedBuffer = null;
  }
}
