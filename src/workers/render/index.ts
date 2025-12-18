import * as Comlink from "comlink";
import type {
  RenderApi,
  ViewportSize,
  SerializedInputEvent,
  DebugBinding,
  DebugUpdateEvent,
} from "~/shared/types";
import RenderExperience from "./experience";

let experience: RenderExperience | null = null;

const api: RenderApi = {
  async init(
    canvas: OffscreenCanvas,
    viewport: ViewportSize,
    debug: boolean,
    onProgress?: (progress: number) => void,
    onReady?: () => void,
    onFrameTiming?: (deltaMs: number) => void,
  ): Promise<void> {
    experience = new RenderExperience(
      canvas,
      viewport,
      debug,
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

  dispose(): void {
    experience?.dispose();
    experience = null;
  },
};

Comlink.expose(api);
