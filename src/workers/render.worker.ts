/**
 * Render Worker Entry Point
 *
 * Implements the RenderApi interface by delegating to the Experience class.
 * This separation keeps the API factory at the worker boundary while
 * the domain logic lives in the renderer module.
 */
import * as Comlink from "comlink";
import { SharedTransformBuffer } from "~/shared/buffers";
import type {
  RenderApi,
  ViewportSize,
  SerializedInputEvent,
  DebugBinding,
  DebugUpdateEvent,
  EntityId,
  SharedBuffers,
  DebugCollider,
} from "~/shared/types";
import Experience from "../renderer";

/**
 * Creates the RenderApi implementation
 *
 * The API wraps the Experience class and handles:
 * - Lazy initialization (experience created on init())
 * - SharedArrayBuffer wrapping
 * - Method delegation to experience instance
 */
function createRenderApi(): RenderApi {
  let experience: Experience | null = null;

  return {
    async init(
      canvas: OffscreenCanvas,
      viewport: ViewportSize,
      debug: boolean,
      sharedBuffers: SharedBuffers,
      onProgress?: (progress: number) => void,
      onReady?: () => void,
      onFrameTiming?: (deltaMs: number) => void,
    ): Promise<void> {
      const sharedBuffer = new SharedTransformBuffer(
        sharedBuffers.control,
        sharedBuffers.transform,
        sharedBuffers.timing,
      );

      experience = new Experience(
        canvas,
        viewport,
        debug,
        sharedBuffer,
        onProgress,
        onReady,
        onFrameTiming,
      );
    },

    resize(viewport: ViewportSize): void {
      experience?.resize(viewport);
    },

    handleInput(event: SerializedInputEvent): void {
      experience?.handleInput(event);
    },

    async getDebugBindings(): Promise<DebugBinding[]> {
      return experience?.getDebugBindings() ?? [];
    },

    updateDebug(event: DebugUpdateEvent): void {
      experience?.updateDebug(event);
    },

    triggerDebugAction(id: string): void {
      experience?.triggerDebugAction(id);
    },

    async spawnEntity(
      id: EntityId,
      type: string,
      data?: Record<string, unknown>,
      debugCollider?: DebugCollider,
    ): Promise<void> {
      await experience?.spawnEntity(id, type, data, debugCollider);
    },

    removeEntity(id: EntityId): void {
      experience?.removeEntity(id);
    },

    async getPlayerEntityId(): Promise<EntityId | null> {
      return experience?.getPlayerEntityId() ?? null;
    },

    dispose(): void {
      experience?.dispose();
      experience = null;
    },
  };
}

Comlink.expose(createRenderApi());
