import type { ViewportSize } from "~/shared/types";
import CanvasManager from "./canvas-manager";
import InputManager from "./input-manager";
import DebugManager from "./debug-manager";
import WorkerCoordinator from "./worker-coordinator";
import EntitySpawner from "./entity-spawner";
import InputRouter from "./input-router";
import AudioBridge from "./audio-bridge";
import { ErrorOverlay } from "./components/error-overlay";
import { LoadingScreen } from "./components/loading-screen";

/**
 * App - Main thread orchestrator
 *
 * Coordinates all managers and modules:
 * - WorkerCoordinator: Worker lifecycle management
 * - EntitySpawner: Entity creation across workers
 * - InputRouter: Input event routing
 * - AudioBridge: Audio callback wiring
 */
export default class App {
  private canvas: CanvasManager;
  private input: InputManager;
  private debug: DebugManager;

  // Modular components
  private coordinator: WorkerCoordinator;
  private spawner: EntitySpawner | null = null;
  private inputRouter: InputRouter | null = null;
  private audioBridge: AudioBridge;

  private errorOverlay: ErrorOverlay | null = null;
  private loadingScreen: LoadingScreen | null = null;

  private resizeObserver: ResizeObserver | null = null;
  private pixelRatioMediaQuery: MediaQueryList | null = null;
  private pixelRatioHandler: (() => void) | null = null;
  private _initialized = false;

  constructor() {
    // Check for OffscreenCanvas support
    if (!CanvasManager.isSupported()) {
      this.showError(ErrorOverlay.MESSAGES.OFFSCREEN_CANVAS_UNSUPPORTED);
      throw new Error("OffscreenCanvas not supported");
    }

    // Check for SharedArrayBuffer support (requires cross-origin isolation)
    if (typeof SharedArrayBuffer === "undefined") {
      this.showError(ErrorOverlay.MESSAGES.SHARED_ARRAY_BUFFER_UNSUPPORTED);
      throw new Error("SharedArrayBuffer not supported");
    }

    // Initialize managers
    const canvasElement = document.querySelector<HTMLCanvasElement>("#webgl");
    if (!canvasElement) {
      this.showError(ErrorOverlay.MESSAGES.CANVAS_NOT_FOUND);
      throw new Error("Canvas element #webgl not found");
    }

    this.canvas = new CanvasManager(canvasElement);
    this.input = new InputManager(canvasElement);
    this.debug = new DebugManager();
    this.coordinator = new WorkerCoordinator();
    this.audioBridge = new AudioBridge();

    // Show loading screen
    this.showLoadingScreen();

    // Start initialization
    this.init();
  }

  private showLoadingScreen(): void {
    this.loadingScreen = new LoadingScreen();

    // Set up start button callback to unlock audio
    this.loadingScreen.setOnStart(() => {
      this.audioBridge.unlockAudio();
    });

    document.body.appendChild(this.loadingScreen);
  }

  private async init(): Promise<void> {
    try {
      await this.initWorkers();
      this.setupEventListeners();
      this._initialized = true;
    } catch (error) {
      console.error("Failed to initialize app:", error);
      const details = error instanceof Error ? error.message : String(error);
      this.showError(ErrorOverlay.MESSAGES.INIT_FAILED, details);
    }
  }

  private async initWorkers(): Promise<void> {
    // Transfer canvas to workers
    const offscreen = this.canvas.transferToOffscreen();
    const viewport = this.canvas.getViewport();

    // Initialize audio and workers in parallel
    await Promise.all([
      this.audioBridge.init(),
      this.coordinator.init(offscreen, viewport, this.debug.active, {
        onProgress: (progress: number) => {
          this.handleLoadProgress(progress);
        },
        onReady: () => {
          // Resources loaded, show start button
          this.loadingScreen?.showStartButton();
        },
        onFrameTiming: (deltaMs: number) => {
          this.debug.updateFrameTiming(deltaMs);
        },
      }),
    ]);

    // Get worker APIs
    const physicsApi = this.coordinator.getPhysicsApi();
    const renderApi = this.coordinator.getRenderApi();
    const sharedBuffer = this.coordinator.getSharedBuffer();

    // Create dependent modules
    this.spawner = new EntitySpawner(physicsApi, renderApi, sharedBuffer);
    this.inputRouter = new InputRouter(physicsApi, renderApi);

    // Wire up audio callbacks
    this.audioBridge.setupCallbacks(physicsApi, renderApi);

    // Spawn world entities
    await this.spawner.spawnWorld();

    // Start physics simulation
    this.coordinator.startPhysics();

    // Set up debug callbacks after all entities are spawned
    if (this.debug.active) {
      this.debug.setUpdateCallback((event) => {
        renderApi.updateDebug(event);
      });

      this.debug.setActionCallback((id) => {
        renderApi.triggerDebugAction(id);
      });

      // Set up main thread actions for cube spawning
      this.debug.setMainThreadActions({
        spawnCubes: (count: number) => {
          this.spawner?.spawnCubeStorm(count).catch((err) => {
            console.error("Failed to spawn cubes:", err);
          });
        },
        clearCubes: () => {
          this.spawner?.clearCubes().catch((err) => {
            console.error("Failed to clear cubes:", err);
          });
        },
        getCubeCount: () => this.spawner?.getCubeCount() ?? 0,
      });

      // Fetch debug bindings now that all entities are spawned
      const bindings = await renderApi.getDebugBindings();
      this.debug.registerBindings(bindings);
    }
  }

  private setupEventListeners(): void {
    // Input events -> InputRouter
    this.input.setEventCallback((event) => {
      this.inputRouter?.handleInput(event);
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
    // Create handler that can be removed on dispose
    this.pixelRatioHandler = (): void => {
      this.handleResize();
      // Re-register for next change with new media query
      this.updatePixelRatioMediaQuery();
    };

    this.updatePixelRatioMediaQuery();
  }

  private updatePixelRatioMediaQuery(): void {
    // Remove previous listener if exists
    if (this.pixelRatioMediaQuery && this.pixelRatioHandler) {
      this.pixelRatioMediaQuery.removeEventListener(
        "change",
        this.pixelRatioHandler,
      );
    }

    // Create new media query for current pixel ratio
    this.pixelRatioMediaQuery = matchMedia(
      `(resolution: ${window.devicePixelRatio}dppx)`,
    );

    if (this.pixelRatioHandler) {
      this.pixelRatioMediaQuery.addEventListener(
        "change",
        this.pixelRatioHandler,
        { once: true },
      );
    }
  }

  private handleResize(): void {
    const viewport: ViewportSize = {
      width: this.canvas.element.clientWidth,
      height: this.canvas.element.clientHeight,
      pixelRatio: Math.min(window.devicePixelRatio, 2),
    };

    this.coordinator.resize(viewport);
  }

  private handleLoadProgress(progress: number): void {
    // Update loading screen with progress
    const percentage = Math.round(progress * 100);
    this.loadingScreen?.setProgress(
      progress,
      `Loading assets... ${percentage}%`,
    );
  }

  private startStatsLoop(): void {
    const loop = (): void => {
      this.debug.beginFrame();
      // Stats end is called by frame timing callback from worker
      requestAnimationFrame(loop);
    };
    loop();
  }

  /**
   * Show error overlay with a message
   * @param message - Main error message
   * @param details - Optional technical details
   */
  private showError(message: string, details?: string): void {
    if (!this.errorOverlay) {
      this.errorOverlay = new ErrorOverlay();
      document.body.appendChild(this.errorOverlay);
    }
    this.errorOverlay.show(message, details);
  }

  dispose(): void {
    // Clean up error overlay
    this.errorOverlay?.remove();
    this.errorOverlay = null;

    // Clean up pixel ratio listener
    if (this.pixelRatioMediaQuery && this.pixelRatioHandler) {
      this.pixelRatioMediaQuery.removeEventListener(
        "change",
        this.pixelRatioHandler,
      );
    }
    this.pixelRatioMediaQuery = null;
    this.pixelRatioHandler = null;

    this.resizeObserver?.disconnect();
    this.input.dispose();
    this.debug.dispose();

    // Dispose modular components
    this.inputRouter?.dispose();
    this.spawner?.dispose();
    this.audioBridge.dispose();
    this.coordinator.dispose();

    this.inputRouter = null;
    this.spawner = null;
    this._initialized = false;
  }

  get initialized(): boolean {
    return this._initialized;
  }
}
