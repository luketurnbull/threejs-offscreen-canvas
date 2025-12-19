import Stats from "stats.js";
import { Pane, type FolderApi } from "tweakpane";
import type { DebugBinding, DebugUpdateEvent } from "~/shared/types";

export interface DebugUpdateCallback {
  (event: DebugUpdateEvent): void;
}

export interface DebugActionCallback {
  (id: string): void;
}

/**
 * DebugManager - Manages debug UI (Tweakpane + Stats.js) on main thread
 *
 * Receives debug bindings from workers and creates UI controls.
 * Sends updates back to workers when values change.
 */
export default class DebugManager {
  private pane: Pane | null = null;
  private stats: Stats | null = null;
  private folders: Map<string, FolderApi> = new Map();
  private bindings: Map<string, DebugBinding> = new Map();
  private values: Map<string, unknown> = new Map();
  private onUpdate: DebugUpdateCallback | null = null;
  private onAction: DebugActionCallback | null = null;

  readonly active: boolean;

  constructor() {
    this.active = window.location.hash === "#debug";

    if (this.active) {
      this.initPane();
      this.initStats();
    }
  }

  private initPane(): void {
    this.pane = new Pane({
      title: "Debug",
      expanded: true,
    });
  }

  private initStats(): void {
    this.stats = new Stats();
    this.stats.showPanel(0);
    document.body.appendChild(this.stats.dom);
  }

  /**
   * Set callback for when debug values change
   */
  setUpdateCallback(callback: DebugUpdateCallback): void {
    this.onUpdate = callback;
  }

  /**
   * Set callback for when debug actions are triggered
   */
  setActionCallback(callback: DebugActionCallback): void {
    this.onAction = callback;
  }

  /**
   * Register debug bindings from a worker
   */
  registerBindings(bindings: DebugBinding[]): void {
    if (!this.active || !this.pane) return;

    for (const binding of bindings) {
      this.bindings.set(binding.id, binding);
      this.values.set(binding.id, binding.value);
      this.createControl(binding);
    }
  }

  private getOrCreateFolder(name: string): FolderApi {
    if (!this.pane) {
      throw new Error("Pane not initialized");
    }

    let folder = this.folders.get(name);
    if (!folder) {
      folder = this.pane.addFolder({ title: name, expanded: false });
      this.folders.set(name, folder);
    }
    return folder;
  }

  private createControl(binding: DebugBinding): void {
    const folder = this.getOrCreateFolder(binding.folder);

    // Create a proxy object for the binding
    const obj = { [binding.label]: binding.value };

    switch (binding.type) {
      case "number": {
        folder
          .addBinding(obj, binding.label, {
            min: binding.options?.min,
            max: binding.options?.max,
            step: binding.options?.step,
          })
          .on("change", (ev) => {
            this.handleChange(binding.id, ev.value);
          });
        break;
      }

      case "boolean": {
        folder.addBinding(obj, binding.label).on("change", (ev) => {
          this.handleChange(binding.id, ev.value);
        });
        break;
      }

      case "color": {
        folder
          .addBinding(obj, binding.label, {
            color: { type: "float" },
          })
          .on("change", (ev) => {
            this.handleChange(binding.id, ev.value);
          });
        break;
      }

      case "select": {
        folder
          .addBinding(obj, binding.label, {
            options: binding.options?.choices,
          })
          .on("change", (ev) => {
            this.handleChange(binding.id, ev.value);
          });
        break;
      }

      case "button": {
        folder.addButton({ title: binding.label }).on("click", () => {
          this.onAction?.(binding.id);
        });
        break;
      }
    }
  }

  private handleChange(id: string, value: unknown): void {
    this.values.set(id, value);

    if (this.onUpdate) {
      this.onUpdate({ id, value });
    }
  }

  /**
   * Update a binding value (called when worker updates a value)
   */
  updateBinding(id: string, value: unknown): void {
    this.values.set(id, value);
    // Note: Tweakpane will auto-update if we modify the bound object
    // For now, this is mainly for tracking state
  }

  /**
   * Called at the start of each frame
   */
  beginFrame(): void {
    this.stats?.begin();
  }

  /**
   * Called at the end of each frame
   */
  endFrame(): void {
    this.stats?.end();
  }

  /**
   * Called when worker completes a frame - ends the stats measurement
   */
  updateFrameTiming(_deltaMs: number): void {
    this.stats?.end();
  }

  dispose(): void {
    this.pane?.dispose();
    this.pane = null;

    if (this.stats) {
      document.body.removeChild(this.stats.dom);
      this.stats = null;
    }

    this.folders.clear();
    this.bindings.clear();
    this.values.clear();
    this.onUpdate = null;
    this.onAction = null;
  }
}
