/**
 * EntitySpawnerUI - Web Component for entity spawn configuration
 *
 * Provides UI controls for:
 * - Shape selection (box/sphere)
 * - Size slider
 *
 * Fixed position at bottom-left of screen.
 * Uses Shadow DOM for style isolation.
 */

import { config } from "~/shared/config";

export interface SpawnConfig {
  shape: "box" | "sphere";
  size: number;
}

export class EntitySpawnerUI extends HTMLElement {
  private shadow: ShadowRoot;
  private selectedShape: "box" | "sphere" = "box";
  private selectedSize: number = config.spawner.defaultSize;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.render();
    this.setupEventListeners();
  }

  private render(): void {
    this.shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          bottom: 20px;
          left: 20px;
          z-index: 1000;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          user-select: none;
        }

        .container {
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          border-radius: 12px;
          padding: 16px;
          min-width: 180px;
          color: #fff;
        }

        .section {
          margin-bottom: 16px;
        }

        .section:last-child {
          margin-bottom: 0;
        }

        .label {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: #888;
          margin-bottom: 8px;
        }

        /* Shape Toggle */
        .shape-toggle {
          display: flex;
          gap: 8px;
        }

        .shape-btn {
          flex: 1;
          padding: 10px 12px;
          border: 2px solid #444;
          background: transparent;
          color: #aaa;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .shape-btn:hover {
          border-color: #666;
          color: #fff;
        }

        .shape-btn.active {
          border-color: #4a9eff;
          background: rgba(74, 158, 255, 0.15);
          color: #fff;
        }

        .shape-icon {
          font-size: 16px;
        }

        /* Size Slider */
        .size-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .size-slider {
          flex: 1;
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          background: #333;
          border-radius: 3px;
          cursor: pointer;
        }

        .size-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          background: #4a9eff;
          border-radius: 50%;
          cursor: pointer;
          transition: transform 0.1s ease;
        }

        .size-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }

        .size-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          background: #4a9eff;
          border: none;
          border-radius: 50%;
          cursor: pointer;
        }

        .size-value {
          font-family: monospace;
          font-size: 13px;
          color: #aaa;
          min-width: 36px;
          text-align: right;
        }

        /* Instructions */
        .instructions {
          font-size: 11px;
          color: #666;
          text-align: center;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #333;
        }
      </style>

      <div class="container">
        <div class="section">
          <div class="label">Shape</div>
          <div class="shape-toggle">
            <button class="shape-btn active" data-shape="box">
              <span class="shape-icon">[ ]</span>
              <span>Box</span>
            </button>
            <button class="shape-btn" data-shape="sphere">
              <span class="shape-icon">( o )</span>
              <span>Sphere</span>
            </button>
          </div>
        </div>

        <div class="section">
          <div class="label">Size</div>
          <div class="size-row">
            <input type="range" class="size-slider" min="${config.spawner.minSize}" max="${config.spawner.maxSize}" step="0.1" value="${config.spawner.defaultSize}">
            <span class="size-value">${config.spawner.defaultSize.toFixed(1)}</span>
          </div>
        </div>

        <div class="instructions">
          Click on canvas to spawn
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Shape toggle buttons
    const shapeButtons =
      this.shadow.querySelectorAll<HTMLButtonElement>(".shape-btn");
    shapeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const shape = btn.dataset.shape as "box" | "sphere";
        this.setShape(shape);
      });
    });

    // Size slider
    const sizeSlider =
      this.shadow.querySelector<HTMLInputElement>(".size-slider");
    sizeSlider?.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      this.setSize(parseFloat(target.value));
    });
  }

  private setShape(shape: "box" | "sphere"): void {
    this.selectedShape = shape;

    // Update button states
    const buttons =
      this.shadow.querySelectorAll<HTMLButtonElement>(".shape-btn");
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.shape === shape);
    });
  }

  private setSize(size: number): void {
    this.selectedSize = size;

    // Update display
    const sizeValue = this.shadow.querySelector(".size-value");
    if (sizeValue) {
      sizeValue.textContent = size.toFixed(1);
    }
  }

  /**
   * Get the current spawn configuration
   */
  getSpawnConfig(): SpawnConfig {
    return {
      shape: this.selectedShape,
      size: this.selectedSize,
    };
  }

  /**
   * Programmatically set the shape
   */
  setSelectedShape(shape: "box" | "sphere"): void {
    this.setShape(shape);
  }

  /**
   * Programmatically set the size
   */
  setSelectedSize(size: number): void {
    this.selectedSize = Math.max(
      config.spawner.minSize,
      Math.min(config.spawner.maxSize, size),
    );

    // Update slider and display
    const sizeSlider =
      this.shadow.querySelector<HTMLInputElement>(".size-slider");
    const sizeValue = this.shadow.querySelector(".size-value");

    if (sizeSlider) sizeSlider.value = this.selectedSize.toString();
    if (sizeValue) sizeValue.textContent = this.selectedSize.toFixed(1);
  }
}

// Register the custom element
customElements.define("entity-spawner-ui", EntitySpawnerUI);
