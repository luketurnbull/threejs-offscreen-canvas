import type {
  SerializedInputEvent,
  ViewportSize,
  DebugBinding,
  DebugUpdateEvent,
} from "./events";
import type { EntityId } from "./entity";
import type { SharedBuffers } from "./physics-api";

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
    sharedBuffers: SharedBuffers,
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

  // ============================================
  // Entity Management (for physics sync)
  // ============================================

  /**
   * Spawn a render entity (mesh) for a physics entity
   */
  spawnEntity(
    id: EntityId,
    type: string,
    data?: Record<string, unknown>,
  ): Promise<void>;

  /**
   * Remove a render entity
   */
  removeEntity(id: EntityId): void;

  /**
   * Get the player entity ID (for camera following)
   */
  getPlayerEntityId(): Promise<EntityId | null>;

  /**
   * Clean up and dispose resources
   */
  dispose(): void;
}
