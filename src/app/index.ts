import CanvasManager from "./canvas-manager";
import InputManager from "./input-manager";
import DebugManager from "./debug-manager";
import WorkerCoordinator from "./worker-coordinator";
import EntityCoordinator from "./entities";
import InputRouter from "./input-router";
import SpawnController from "./spawn-controller";
import ResizeHandler from "./resize-handler";
import { ErrorOverlay } from "./components/error-overlay";
import { LoadingScreen } from "./components/loading-screen";
import { EntitySpawnerUI } from "./components/entity-spawner-ui";

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
  private entities: EntityCoordinator | null = null;
  private inputRouter: InputRouter | null = null;
  private spawnController: SpawnController | null = null;
  private resizeHandler: ResizeHandler | null = null;

  // UI components
  private errorOverlay: ErrorOverlay | null = null;
  private loadingScreen: LoadingScreen | null = null;
  private spawnerUI: EntitySpawnerUI | null = null;

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

    // Show loading screen
    this.showLoadingScreen();

    // Start initialization
    this.init();
  }

  private showLoadingScreen(): void {
    this.loadingScreen = new LoadingScreen();

    // Set up start button callback to unlock audio
    this.loadingScreen.setOnStart(() => {
      this.coordinator.getAudioBridge().unlockAudio();
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

    // Initialize coordinator (handles audio, physics, and render workers with progress tracking)
    await this.coordinator.init(offscreen, viewport, this.debug.active, {
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
    });

    // Get worker APIs
    const physicsApi = this.coordinator.getPhysicsApi();
    const renderApi = this.coordinator.getRenderApi();
    const sharedBuffer = this.coordinator.getSharedBuffer();

    // Create dependent modules
    this.entities = new EntityCoordinator(physicsApi, renderApi, sharedBuffer);
    this.inputRouter = new InputRouter(physicsApi, renderApi);

    // Create spawner UI and controller
    this.spawnerUI = new EntitySpawnerUI();
    document.body.appendChild(this.spawnerUI);
    this.spawnController = new SpawnController(
      this.spawnerUI,
      this.entities,
      renderApi,
    );

    // Wire up audio callbacks
    this.coordinator.getAudioBridge().setupCallbacks(physicsApi, renderApi);

    // Initialize world (ground, player, test objects)
    await this.entities.initWorld();

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

      // Set up main thread actions for entity spawning
      this.debug.setMainThreadActions({
        spawnCubes: (count: number) => {
          this.entities?.spawnTestObjects(count, 0).catch((err) => {
            console.error("Failed to spawn boxes:", err);
          });
        },
        spawnSpheres: (count: number) => {
          this.entities?.spawnTestObjects(0, count).catch((err) => {
            console.error("Failed to spawn spheres:", err);
          });
        },
        clearCubes: () => {
          this.entities?.clearAll().catch((err) => {
            console.error("Failed to clear entities:", err);
          });
        },
        getCubeCount: () => this.entities?.getTotalCount() ?? 0,
        getBoxCount: () => this.entities?.getBoxCount() ?? 0,
        getSphereCount: () => this.entities?.getSphereCount() ?? 0,
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

    // Click events -> SpawnController
    this.input.setClickCallback((event) => {
      this.spawnController?.handleClick(event);
    });

    // Resize handling
    this.resizeHandler = new ResizeHandler(this.canvas.element, (viewport) => {
      this.coordinator.resize(viewport);
    });
    this.resizeHandler.start();

    // Critical: Clean up GPU resources on page unload to prevent context exhaustion
    window.addEventListener("beforeunload", () => {
      this.dispose();
    });

    // Start stats tracking if debug active
    if (this.debug.active) {
      this.startStatsLoop();
    }
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
    // Clean up UI components
    this.errorOverlay?.remove();
    this.errorOverlay = null;
    this.spawnerUI?.remove();
    this.spawnerUI = null;

    // Clean up managers
    this.resizeHandler?.dispose();
    this.resizeHandler = null;
    this.input.dispose();
    this.debug.dispose();

    // Dispose modular components
    this.spawnController?.dispose();
    this.inputRouter?.dispose();
    this.entities?.dispose();
    this.coordinator.dispose();

    this.spawnController = null;
    this.inputRouter = null;
    this.entities = null;
    this._initialized = false;
  }

  get initialized(): boolean {
    return this._initialized;
  }
}
