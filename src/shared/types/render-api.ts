import type {
  SerializedInputEvent,
  ViewportSize,
  DebugBinding,
  DebugUpdateEvent,
} from "./events";

/**
 * Render Worker API - exposed via Comlink
 */
export interface RenderApi {
  /**
   * Initialize the renderer with an OffscreenCanvas
   * Note: Callbacks must be passed as separate arguments (not in object)
   * because Comlink.proxy functions cannot be nested in objects.
   */
  init(
    canvas: OffscreenCanvas,
    viewport: ViewportSize,
    debug: boolean,
    onProgress?: (progress: number) => void,
    onReady?: () => void,
    onFrameTiming?: (deltaMs: number) => void,
  ): Promise<void>;

  /**
   * Handle viewport resize
   */
  resize(viewport: ViewportSize): void;

  /**
   * Handle input events from main thread
   */
  handleInput(event: SerializedInputEvent): void;

  /**
   * Get all debug bindings from the scene
   */
  getDebugBindings(): Promise<DebugBinding[]>;

  /**
   * Update a debug value
   */
  updateDebug(event: DebugUpdateEvent): void;

  /**
   * Trigger a debug button action
   */
  triggerDebugAction(id: string): void;

  /**
   * Clean up and dispose resources
   */
  dispose(): void;
}
