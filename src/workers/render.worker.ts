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
import {
  assertInitialized,
  assertValidEntityId,
  assertNonEmptyString,
} from "~/shared/validation";
import Experience from "../renderer";

/**
 * Creates the RenderApi implementation
 *
 * The API wraps the Experience class and handles:
 * - Lazy initialization (experience created on init())
 * - SharedArrayBuffer wrapping
 * - Method delegation to experience instance
 * - Input validation at worker boundary
 */
function createRenderApi(): RenderApi {
  let experience: Experience | null = null;

  /**
   * Assert that Experience is initialized
   * @throws Error if experience is null
   */
  const assertExperienceInitialized = (): Experience => {
    assertInitialized(experience, "Experience", "RenderApi");
    return experience;
  };

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
      // Warn if already initialized
      if (experience) {
        console.warn(
          "[RenderApi.init] Already initialized. Disposing and reinitializing.",
        );
        experience.dispose();
      }

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

      // Initialize WebGPU renderer (async)
      await experience.init();
    },

    resize(viewport: ViewportSize): void {
      assertExperienceInitialized().resize(viewport);
    },

    handleInput(event: SerializedInputEvent): void {
      assertExperienceInitialized().handleInput(event);
    },

    async getDebugBindings(): Promise<DebugBinding[]> {
      return assertExperienceInitialized().getDebugBindings();
    },

    updateDebug(event: DebugUpdateEvent): void {
      assertExperienceInitialized().updateDebug(event);
    },

    triggerDebugAction(id: string): void {
      assertNonEmptyString(id, "action id", "RenderApi.triggerDebugAction");
      assertExperienceInitialized().triggerDebugAction(id);
    },

    async spawnEntity(
      id: EntityId,
      type: string,
      data?: Record<string, unknown>,
      debugCollider?: DebugCollider,
    ): Promise<void> {
      // Validate inputs at worker boundary
      assertValidEntityId(id, "RenderApi.spawnEntity");
      assertNonEmptyString(type, "entity type", "RenderApi.spawnEntity");

      await assertExperienceInitialized().spawnEntity(
        id,
        type,
        data,
        debugCollider,
      );
    },

    removeEntity(id: EntityId): void {
      assertValidEntityId(id, "RenderApi.removeEntity");
      assertExperienceInitialized().removeEntity(id);
    },

    async getPlayerEntityId(): Promise<EntityId | null> {
      return assertExperienceInitialized().getPlayerEntityId();
    },

    async spawnCubes(entityIds: EntityId[], size: number): Promise<void> {
      // Validate all entity IDs at worker boundary
      for (const id of entityIds) {
        assertValidEntityId(id, "RenderApi.spawnCubes");
      }
      await assertExperienceInitialized().spawnCubes(entityIds, size);
    },

    removeCubes(entityIds: EntityId[]): void {
      for (const id of entityIds) {
        assertValidEntityId(id, "RenderApi.removeCubes");
      }
      assertExperienceInitialized().removeCubes(entityIds);
    },

    dispose(): void {
      experience?.dispose();
      experience = null;
    },
  };
}

Comlink.expose(createRenderApi());
