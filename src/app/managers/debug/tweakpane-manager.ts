import { Pane, type FolderApi } from "tweakpane";
import type { DebugBinding, DebugUpdateEvent } from "~/shared/types";

export interface DebugUpdateCallback {
  (event: DebugUpdateEvent): void;
}

export interface DebugActionCallback {
  (id: string): void;
}

export interface MainThreadActions {
  spawnCubes?: (count: number) => void;
  spawnSpheres?: (count: number) => void;
  clearCubes?: () => void;
  getCubeCount?: () => number;
  getBoxCount?: () => number;
  getSphereCount?: () => number;
}

/**
 * TweakpaneManager - Manages Tweakpane debug UI
 */
export default class TweakpaneManager {
  private pane: Pane;
  private folders: Map<string, FolderApi> = new Map();
  private bindings: Map<string, DebugBinding> = new Map();
  private values: Map<string, unknown> = new Map();
  private onUpdate: DebugUpdateCallback | null = null;
  private onAction: DebugActionCallback | null = null;
  private mainThreadActions: MainThreadActions | null = null;

  constructor() {
    this.pane = new Pane({ title: "Debug", expanded: true });
  }

  setMainThreadActions(actions: MainThreadActions): void {
    this.mainThreadActions = actions;
    this.createCubeStormControls();
  }

  private createCubeStormControls(): void {
    if (!this.mainThreadActions) return;

    const folder = this.getOrCreateFolder("Cube Storm");
    folder.expanded = true;

    const cubeState = { count: 0 };
    const countBinding = folder.addBinding(cubeState, "count", {
      label: "Cubes",
      readonly: true,
    });

    const updateCount = (): void => {
      if (this.mainThreadActions?.getCubeCount) {
        cubeState.count = this.mainThreadActions.getCubeCount();
        countBinding.refresh();
      }
    };

    folder.addButton({ title: "Drop 100 Cubes" }).on("click", () => {
      this.mainThreadActions?.spawnCubes?.(100);
      setTimeout(updateCount, 100);
    });

    folder.addButton({ title: "Drop 500 Cubes" }).on("click", () => {
      this.mainThreadActions?.spawnCubes?.(500);
      setTimeout(updateCount, 100);
    });

    folder.addButton({ title: "Clear All Cubes" }).on("click", () => {
      this.mainThreadActions?.clearCubes?.();
      setTimeout(updateCount, 100);
    });

    updateCount();
  }

  setUpdateCallback(callback: DebugUpdateCallback): void {
    this.onUpdate = callback;
  }

  setActionCallback(callback: DebugActionCallback): void {
    this.onAction = callback;
  }

  registerBindings(bindings: DebugBinding[]): void {
    for (const binding of bindings) {
      this.bindings.set(binding.id, binding);
      this.values.set(binding.id, binding.value);
      this.createControl(binding);
    }
  }

  private getOrCreateFolder(name: string): FolderApi {
    let folder = this.folders.get(name);
    if (!folder) {
      folder = this.pane.addFolder({ title: name, expanded: false });
      this.folders.set(name, folder);
    }
    return folder;
  }

  private createControl(binding: DebugBinding): void {
    const folder = this.getOrCreateFolder(binding.folder);
    const obj = { [binding.label]: binding.value };

    switch (binding.type) {
      case "number":
        folder
          .addBinding(obj, binding.label, {
            min: binding.options?.min,
            max: binding.options?.max,
            step: binding.options?.step,
          })
          .on("change", (ev) => this.handleChange(binding.id, ev.value));
        break;

      case "boolean":
        folder
          .addBinding(obj, binding.label)
          .on("change", (ev) => this.handleChange(binding.id, ev.value));
        break;

      case "color":
        folder
          .addBinding(obj, binding.label, { color: { type: "float" } })
          .on("change", (ev) => this.handleChange(binding.id, ev.value));
        break;

      case "select":
        folder
          .addBinding(obj, binding.label, { options: binding.options?.choices })
          .on("change", (ev) => this.handleChange(binding.id, ev.value));
        break;

      case "button":
        folder.addButton({ title: binding.label }).on("click", () => {
          this.onAction?.(binding.id);
        });
        break;
    }
  }

  private handleChange(id: string, value: unknown): void {
    this.values.set(id, value);
    this.onUpdate?.({ id, value });
  }

  updateBinding(id: string, value: unknown): void {
    this.values.set(id, value);
  }

  dispose(): void {
    this.pane.dispose();
    this.folders.clear();
    this.bindings.clear();
    this.values.clear();
    this.onUpdate = null;
    this.onAction = null;
  }
}
