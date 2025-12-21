import type {
  SerializedInputEvent,
  ViewportSize,
  DebugBinding,
  DebugUpdateEvent,
} from "./events";
import type { EntityId } from "./entity";
import type { SharedBuffers, DebugCollider } from "./physics-api";
import type { FootstepCallback, ListenerCallback } from "./audio-events";

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
   * @param debugCollider - Optional collider info for debug visualization
   */
  spawnEntity(
    id: EntityId,
    type: string,
    data?: Record<string, unknown>,
    debugCollider?: DebugCollider,
  ): Promise<void>;

  /**
   * Remove a render entity
   */
  removeEntity(id: EntityId): void;

  /**
   * Get the player entity ID (for camera following)
   */
  getPlayerEntityId(): Promise<EntityId | null>;

  // ============================================
  // Instanced Cubes (for stress testing)
  // ============================================

  /**
   * Spawn instanced cubes (batch operation for performance testing)
   * @param entityIds - Pre-generated entity IDs for each cube
   * @param size - Size of each cube
   */
  spawnCubes(entityIds: EntityId[], size: number): Promise<void>;

  /**
   * Remove instanced cubes
   * @param entityIds - Entity IDs to remove
   */
  removeCubes(entityIds: EntityId[]): void;

  /**
   * Clean up and dispose resources
   */
  dispose(): void;

  // ============================================
  // Audio Event Callbacks
  // ============================================

  /**
   * Set callback for footstep events (for audio)
   * Called based on player movement and animation state
   */
  setFootstepCallback(callback: FootstepCallback): void;

  /**
   * Set callback for listener position updates (for spatial audio)
   * Called each frame with camera position/orientation
   */
  setListenerCallback(callback: ListenerCallback): void;
}
