import * as Comlink from "comlink";
import type {
  RenderApi,
  ViewportSize,
  SerializedInputEvent,
  DebugBinding,
  DebugUpdateEvent,
  EntityId,
  SharedBuffers,
} from "~/shared/types";
import { SharedTransformBuffer } from "~/shared/buffers";
import RenderExperience from "./experience";

let experience: RenderExperience | null = null;
let sharedBuffer: SharedTransformBuffer | null = null;

const api: RenderApi = {
  async init(
    canvas: OffscreenCanvas,
    viewport: ViewportSize,
    debug: boolean,
    sharedBuffers: SharedBuffers,
    onProgress?: (progress: number) => void,
    onReady?: () => void,
    onFrameTiming?: (deltaMs: number) => void,
  ): Promise<void> {
    sharedBuffer = new SharedTransformBuffer(
      sharedBuffers.control,
      sharedBuffers.transform,
    );

    experience = new RenderExperience(
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

  // Entity management
  async spawnEntity(
    id: EntityId,
    type: string,
    data?: Record<string, unknown>,
  ): Promise<void> {
    await experience?.spawnEntity(id, type, data);
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

Comlink.expose(api);
