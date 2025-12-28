/**
 * EntitySpawnerUI - Web Component for entity spawn configuration
 *
 * Provides UI controls for:
 * - 3D preview canvas (spinning shape)
 * - Shape selection (box/sphere)
 * - Size slider
 *
 * Fixed position at bottom-left of screen.
 * Uses Shadow DOM for style isolation.
 */

import { config } from "~/shared/config";
import { ShapePreview } from "./shape-preview";
import { ENTITY_SPAWNER_STYLES } from "./entity-spawner-styles";

export interface SpawnConfig {
  shape: "box" | "sphere";
  size: number;
}

export class EntitySpawnerUI extends HTMLElement {
  private shadow: ShadowRoot;
  private selectedShape: "box" | "sphere" = "box";
  private selectedSize: number = config.spawner.defaultSize;
  private shapePreview: ShapePreview | null = null;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: "open" });
    this.render();
    this.setupEventListeners();
    this.initPreview();
  }

  private render(): void {
    this.shadow.innerHTML = `
      <style>${ENTITY_SPAWNER_STYLES}</style>

      <div class="container">
        <div class="section preview-section">
          <canvas class="preview-canvas" width="80" height="80"></canvas>
        </div>

        <div class="section">
          <div class="label">Shape</div>
          <div class="shape-toggle">
            <button class="shape-btn active" data-shape="box">
              <span class="shape-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
                  <path d="m3.3 7 8.7 5 8.7-5"></path>
                  <path d="M12 22V12"></path>
                </svg>
              </span>
              <span>Box</span>
            </button>
            <button class="shape-btn" data-shape="sphere">
              <span class="shape-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                </svg>
              </span>
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

  private initPreview(): void {
    const canvas =
      this.shadow.querySelector<HTMLCanvasElement>(".preview-canvas");
    if (canvas) {
      try {
        this.shapePreview = new ShapePreview(canvas);
        this.shapePreview.setShape(this.selectedShape);
        this.shapePreview.setSize(this.selectedSize);
      } catch (e) {
        console.warn("Failed to initialize shape preview:", e);
      }
    }
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

    // Update preview
    this.shapePreview?.setShape(shape);
  }

  private setSize(size: number): void {
    this.selectedSize = size;

    // Update display
    const sizeValue = this.shadow.querySelector(".size-value");
    if (sizeValue) {
      sizeValue.textContent = size.toFixed(1);
    }

    // Update preview
    this.shapePreview?.setSize(size);
  }

  /**
   * Web Component lifecycle - cleanup WebGL context
   */
  disconnectedCallback(): void {
    this.shapePreview?.dispose();
    this.shapePreview = null;
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

    // Update preview
    this.shapePreview?.setSize(this.selectedSize);
  }
}

// Register the custom element
customElements.define("entity-spawner-ui", EntitySpawnerUI);
