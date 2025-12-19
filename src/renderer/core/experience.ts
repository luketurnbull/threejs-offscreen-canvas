import * as THREE from "three";
import type {
  ViewportSize,
  SerializedInputEvent,
  DebugBinding,
  DebugUpdateEvent,
  EntityId,
  DebugCollider,
} from "~/shared/types";
import { SharedTransformBuffer } from "~/shared/buffers";
import { config } from "~/shared/config";

// Core classes
import Renderer from "./renderer";
import Camera from "./camera";

// Systems
import Time from "../systems/time";
import Debug from "../systems/debug";
import Resources from "../systems/resources";
import InputState from "../systems/input-state";
import sources from "../systems/sources";

// Sync
import TransformSync from "../sync/transform-sync";

// World
import World from "../world/world";

/**
 * Experience - Main entry point and orchestrator
 *
 * Responsible for:
 * - Creating the THREE.Scene
 * - Instantiating all systems with dependency injection
 * - Wiring up Time tick callbacks
 * - Routing external API calls to appropriate systems
 * - Orchestrating the update loop
 *
 * This is a thin orchestrator - actual work is delegated to:
 * - Renderer: WebGLRenderer wrapper
 * - Camera: PerspectiveCamera + follow behavior
 * - World: Entity and scene object management
 * - TransformSync: Physics interpolation
 */
class Experience {
  private scene: THREE.Scene;
  private time: Time;
  private debug: Debug;
  private resources: Resources;
  private inputState: InputState;
  private camera: Camera;
  private renderer: Renderer;
  private world: World;
  private transformSync: TransformSync;

  private unsubscribeTick: (() => void) | null = null;

  // Callbacks
  private onProgress: ((progress: number) => void) | null = null;
  private onReady: (() => void) | null = null;
  private onFrameTiming: ((deltaMs: number) => void) | null = null;

  constructor(
    canvas: OffscreenCanvas,
    viewport: ViewportSize,
    debugEnabled: boolean,
    sharedBuffer: SharedTransformBuffer,
    onProgress?: (progress: number) => void,
    onReady?: () => void,
    onFrameTiming?: (deltaMs: number) => void,
  ) {
    this.onProgress = onProgress ?? null;
    this.onReady = onReady ?? null;
    this.onFrameTiming = onFrameTiming ?? null;

    // Create scene
    this.scene = new THREE.Scene();

    // Initialize core systems
    this.time = new Time();
    this.debug = new Debug(debugEnabled);
    this.resources = new Resources(sources);
    this.inputState = new InputState();

    // Create rendering systems
    this.camera = new Camera(this.scene, viewport, {
      distance: config.camera.follow.distance,
      height: config.camera.follow.height,
      lookAtHeight: config.camera.follow.lookAtHeight,
      damping: config.camera.follow.damping,
    });
    this.renderer = new Renderer(canvas, viewport);
    this.transformSync = new TransformSync(sharedBuffer);

    // Create world (entity + scene object manager)
    this.world = new World({
      scene: this.scene,
      resources: this.resources,
      time: this.time,
      debug: this.debug,
      inputState: this.inputState,
      camera: this.camera,
    });

    // Wire up resource loading callbacks
    this.resources.on("progress", ({ progress }) => {
      this.onProgress?.(progress);
    });

    this.resources.on("ready", () => {
      this.world.createSceneObjects();
      this.onReady?.();
    });

    // Start render loop
    this.unsubscribeTick = this.time.on("tick", ({ delta, elapsed }) => {
      this.update(delta, elapsed);
    });
  }

  // ============================================
  // Update Loop
  // ============================================

  private update(delta: number, elapsed: number): void {
    // Sync transforms from physics with interpolation
    const newPhysicsFrame = this.transformSync.update(this.world.getEntities());

    // Update world (entities, animations, lifecycle hooks)
    this.world.update(delta, elapsed, newPhysicsFrame);

    // Update camera (follow target)
    this.camera.update();

    // Render scene
    this.renderer.render(this.scene, this.camera.instance);

    // Report frame timing
    this.onFrameTiming?.(delta);
  }

  // ============================================
  // Public API (routed to appropriate systems)
  // ============================================

  resize(viewport: ViewportSize): void {
    this.camera.resize(viewport);
    this.renderer.resize(viewport);
  }

  handleInput(event: SerializedInputEvent): void {
    this.inputState.handleEvent(event);
  }

  getDebugBindings(): DebugBinding[] {
    return this.debug.getBindings();
  }

  updateDebug(event: DebugUpdateEvent): void {
    this.debug.applyUpdate(event);
  }

  triggerDebugAction(id: string): void {
    this.debug.triggerAction(id);
  }

  // ============================================
  // Entity Management (routed to World)
  // ============================================

  /**
   * Wait for resources to be ready with timeout
   */
  private async waitForResources(timeoutMs = 30000): Promise<void> {
    if (this.resources.isReady) return;

    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Resource loading timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const unsubscribeError = this.resources.on(
        "error",
        ({ source, error }) => {
          // Log but don't reject on individual resource errors
          // The resource loader provides fallbacks
          console.warn(`Resource "${source}" failed to load:`, error.message);
        },
      );

      this.resources.on("ready", () => {
        clearTimeout(timeout);
        unsubscribeError();
        resolve();
      });
    });
  }

  async spawnEntity(
    id: EntityId,
    type: string,
    data?: Record<string, unknown>,
    debugCollider?: DebugCollider,
  ): Promise<void> {
    // Wait for resources with timeout
    await this.waitForResources();

    await this.world.spawnEntity(id, type, data, debugCollider);

    // Rebuild shared buffer entity map after spawn
    this.transformSync.rebuildEntityMap();
  }

  removeEntity(id: EntityId): void {
    this.world.removeEntity(id);
  }

  getPlayerEntityId(): EntityId | null {
    return this.world.getPlayerEntityId();
  }

  // ============================================
  // Cleanup
  // ============================================

  dispose(): void {
    this.unsubscribeTick?.();
    this.time.dispose();
    this.world.dispose();
    this.camera.dispose();
    this.renderer.dispose();
    this.debug.dispose();
  }
}

export default Experience;
