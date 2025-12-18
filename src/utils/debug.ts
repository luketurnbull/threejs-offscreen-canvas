import { Pane } from "tweakpane";
import Stats from "stats.js";
export default class Debug {
  active: boolean;
  ui: Pane | null;
  stats: Stats | null;

  constructor() {
    this.active = window.location.hash === "#debug";
    this.ui = this.active ? new Pane() : null;
    this.stats = this.active ? this.createStats() : null;
  }

  private createStats(): Stats {
    const stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb
    stats.dom.style.position = "absolute";
    stats.dom.style.top = "0px";
    stats.dom.style.left = "0px";
    document.body.appendChild(stats.dom);
    return stats;
  }

  /**
   * Call at the start of the render loop
   */
  begin(): void {
    this.stats?.begin();
  }

  /**
   * Call at the end of the render loop
   */
  end(): void {
    this.stats?.end();
  }

  dispose(): void {
    this.ui?.dispose();
    if (this.stats) {
      document.body.removeChild(this.stats.dom);
    }
  }
}
