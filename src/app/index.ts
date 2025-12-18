import type { ViewportSize } from "~/shared/types";
import CanvasManager from "./canvas-manager";
import InputManager from "./input-manager";
import DebugManager from "./debug-manager";
import WorkerBridge from "./worker-bridge";

/**
 * App - Main thread orchestrator
 *
 * Coordinates all managers and worker communication via WorkerBridge.
 * Handles initialization sequence and lifecycle.
 */
export default class App {
  private canvas: CanvasManager;
  private input: InputManager;
  private debug: DebugManager;
  private bridge: WorkerBridge;

  private resizeObserver: ResizeObserver | null = null;
  private _initialized = false;

  constructor() {
    // Check for OffscreenCanvas support
    if (!CanvasManager.isSupported()) {
      this.showError(
        "Your browser doesn't support OffscreenCanvas. Please use a modern browser.",
      );
      throw new Error("OffscreenCanvas not supported");
    }

    // Initialize managers
    const canvasElement = document.querySelector<HTMLCanvasElement>("#webgl");
    if (!canvasElement) {
      throw new Error("Canvas element #webgl not found");
    }

    this.canvas = new CanvasManager(canvasElement);
    this.input = new InputManager(canvasElement);
    this.debug = new DebugManager();
    this.bridge = new WorkerBridge();

    // Start initialization
    this.init();
  }

  private async init(): Promise<void> {
    try {
      await this.initWorkers();
      this.setupEventListeners();
      this._initialized = true;
      console.log("App initialized successfully");
    } catch (error) {
      console.error("Failed to initialize app:", error);
      this.showError("Failed to initialize application");
    }
  }

  private async initWorkers(): Promise<void> {
    // Transfer canvas to worker bridge
    const offscreen = this.canvas.transferToOffscreen();
    const viewport = this.canvas.getViewport();

    await this.bridge.init(offscreen, viewport, this.debug.active, {
      onProgress: (progress: number) => {
        this.handleLoadProgress(progress);
      },
      onReady: () => {
        this.handleLoadComplete();
      },
      onFrameTiming: (deltaMs: number) => {
        this.debug.updateFrameTiming(deltaMs);
      },
    });

    // Set up debug callbacks
    const renderApi = this.bridge.getRenderApi();
    if (this.debug.active && renderApi) {
      this.debug.setUpdateCallback((event) => {
        renderApi.updateDebug(event);
      });

      this.debug.setActionCallback((id) => {
        renderApi.triggerDebugAction(id);
      });
    }
  }

  private setupEventListeners(): void {
    // Input events -> WorkerBridge (routes to both workers)
    this.input.setEventCallback((event) => {
      this.bridge.handleInput(event);
    });

    // Resize handling
    this.resizeObserver = new ResizeObserver(this.handleResize.bind(this));
    this.resizeObserver.observe(this.canvas.element);

    // Also listen for devicePixelRatio changes
    this.setupPixelRatioListener();

    // Start stats tracking if debug active
    if (this.debug.active) {
      this.startStatsLoop();
    }
  }

  private setupPixelRatioListener(): void {
    const updatePixelRatio = (): void => {
      this.handleResize();

      // Re-register for next change
      matchMedia(
        `(resolution: ${window.devicePixelRatio}dppx)`,
      ).addEventListener("change", updatePixelRatio, { once: true });
    };

    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
      "change",
      updatePixelRatio,
      { once: true },
    );
  }

  private handleResize(): void {
    const viewport: ViewportSize = {
      width: this.canvas.element.clientWidth,
      height: this.canvas.element.clientHeight,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
    };

    this.bridge.resize(viewport);
  }

  private handleLoadProgress(progress: number): void {
    console.log(`Loading: ${Math.round(progress * 100)}%`);
    // TODO: Update loading UI
  }

  private async handleLoadComplete(): Promise<void> {
    console.log("Loading complete");

    // Fetch and register debug bindings now that world is loaded
    const renderApi = this.bridge.getRenderApi();
    if (this.debug.active && renderApi) {
      const bindings = await renderApi.getDebugBindings();
      this.debug.registerBindings(bindings);
    }
  }

  private startStatsLoop(): void {
    const loop = (): void => {
      this.debug.beginFrame();
      // Stats end is called by frame timing callback from worker
      requestAnimationFrame(loop);
    };
    loop();
  }

  private showError(message: string): void {
    const errorDiv = document.createElement("div");
    errorDiv.className = "error-overlay";
    errorDiv.innerHTML = `
      <div class="error-content">
        <h1>Error</h1>
        <p>${message}</p>
      </div>
    `;

    // Add styles
    const style = document.createElement("style");
    style.textContent = `
      .error-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
        font-family: system-ui, sans-serif;
      }
      .error-content {
        background: #1a1a1a;
        padding: 2rem 3rem;
        border-radius: 8px;
        border: 1px solid #333;
        text-align: center;
        max-width: 500px;
      }
      .error-content h1 {
        color: #ff4444;
        margin: 0 0 1rem;
        font-size: 1.5rem;
      }
      .error-content p {
        color: #ccc;
        margin: 0;
        line-height: 1.6;
      }
    `;
    document.head.appendChild(style);
    document.body.appendChild(errorDiv);
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.input.dispose();
    this.debug.dispose();
    this.bridge.dispose();
    this._initialized = false;
  }

  get initialized(): boolean {
    return this._initialized;
  }
}
