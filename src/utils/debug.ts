import type { FolderApi } from "tweakpane";

/**
 * Debug - Type definition for debug UI
 * Used as type reference for World components
 */
export default class Debug {
  active: boolean = false;
  ui: DebugUI | null = null;

  begin(): void {}
  end(): void {}
  dispose(): void {}
}

interface DebugUI {
  addFolder(options: { title: string }): FolderApi;
}
