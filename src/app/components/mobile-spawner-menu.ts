/**
 * MobileSpawnerMenu - Web Component for mobile spawn configuration
 *
 * Collapsed: Small button showing current shape icon (top-left)
 * Expanded: Modal overlay with shape toggle + size slider
 *
 * Implements same SpawnConfig interface as EntitySpawnerUI.
 */

import { config } from "~/shared/config";
import { ShapePreview } from "./shape-preview";
import type { SpawnConfig } from "./entity-spawner-ui";

export class MobileSpawnerMenu extends HTMLElement {
  private shadow: ShadowRoot;
  private selectedShape: "box" | "sphere" = "box";
  private selectedSize: number = config.spawner.defaultSize;
  private shapePreview: ShapePreview | null = null;
  private _isOpen = false;

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
          top: 20px;
          left: 20px;
          z-index: 1000;
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          user-select: none;
          -webkit-user-select: none;
        }

        .toggle-btn {
          width: 50px;
          height: 50px;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.6);
          border: 2px solid rgba(255, 255, 255, 0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(4px);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .toggle-btn:active {
          transform: scale(0.95);
          background: rgba(74, 158, 255, 0.4);
        }

        .toggle-btn svg {
          width: 24px;
          height: 24px;
        }

        .modal-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          z-index: 1001;
          align-items: center;
          justify-content: center;
        }

        .modal-overlay.open {
          display: flex;
        }

        .modal {
          background: rgba(30, 30, 30, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 16px;
          padding: 24px;
          width: 280px;
          max-width: 90vw;
        }

        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }

        .modal-title {
          font-size: 16px;
          font-weight: 600;
          color: #fff;
        }

        .close-btn {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(255, 255, 255, 0.1);
          border: none;
          color: rgba(255, 255, 255, 0.6);
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .close-btn:active {
          background: rgba(255, 255, 255, 0.2);
        }

        .preview-section {
          display: flex;
          justify-content: center;
          margin-bottom: 20px;
        }

        .preview-canvas {
          width: 100px;
          height: 100px;
          border-radius: 12px;
          background: rgba(0, 0, 0, 0.4);
        }

        .section {
          margin-bottom: 16px;
        }

        .label {
          font-size: 11px;
          font-weight: 600;
          color: rgba(255, 255, 255, 0.5);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .shape-toggle {
          display: flex;
          gap: 8px;
        }

        .shape-btn {
          flex: 1;
          height: 48px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.08);
          border: 2px solid transparent;
          color: rgba(255, 255, 255, 0.6);
          font-size: 13px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .shape-btn:active {
          transform: scale(0.98);
        }

        .shape-btn.active {
          background: rgba(74, 158, 255, 0.2);
          border-color: #4a9eff;
          color: #fff;
        }

        .shape-btn svg {
          width: 20px;
          height: 20px;
        }

        .size-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .size-slider {
          flex: 1;
          height: 6px;
          -webkit-appearance: none;
          appearance: none;
          background: rgba(255, 255, 255, 0.15);
          border-radius: 3px;
          outline: none;
        }

        .size-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: #4a9eff;
          cursor: pointer;
        }

        .size-value {
          min-width: 36px;
          text-align: right;
          font-size: 14px;
          font-weight: 600;
          color: #fff;
        }

        .instructions {
          text-align: center;
          font-size: 12px;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 16px;
        }
      </style>

      <button class="toggle-btn" aria-label="Open spawn menu">
        <svg class="box-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
          <path d="m3.3 7 8.7 5 8.7-5"></path>
          <path d="M12 22V12"></path>
        </svg>
        <svg class="sphere-icon" style="display: none;" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
      </button>

      <div class="modal-overlay">
        <div class="modal">
          <div class="modal-header">
            <span class="modal-title">Spawn Settings</span>
            <button class="close-btn" aria-label="Close">×</button>
          </div>

          <div class="preview-section">
            <canvas class="preview-canvas" width="100" height="100"></canvas>
          </div>

          <div class="section">
            <div class="label">Shape</div>
            <div class="shape-toggle">
              <button class="shape-btn active" data-shape="box">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"></path>
                  <path d="m3.3 7 8.7 5 8.7-5"></path>
                  <path d="M12 22V12"></path>
                </svg>
                Box
              </button>
              <button class="shape-btn" data-shape="sphere">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                </svg>
                Sphere
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

          <div class="instructions">Tap outside to spawn</div>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Toggle button
    const toggleBtn = this.shadow.querySelector(".toggle-btn");
    toggleBtn?.addEventListener("click", () => this.open());

    // Close button
    const closeBtn = this.shadow.querySelector(".close-btn");
    closeBtn?.addEventListener("click", () => this.close());

    // Modal overlay click to close
    const overlay = this.shadow.querySelector(".modal-overlay");
    overlay?.addEventListener("click", (e) => {
      if (e.target === overlay) this.close();
    });

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

  private open(): void {
    this._isOpen = true;
    const overlay = this.shadow.querySelector(".modal-overlay");
    overlay?.classList.add("open");

    // Initialize preview when opened
    if (!this.shapePreview) {
      this.initPreview();
    }
  }

  private close(): void {
    this._isOpen = false;
    const overlay = this.shadow.querySelector(".modal-overlay");
    overlay?.classList.remove("open");
  }

  get isOpen(): boolean {
    return this._isOpen;
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

  private setShape(shape: "box" | "sphere"): void {
    this.selectedShape = shape;

    // Update button states
    const buttons =
      this.shadow.querySelectorAll<HTMLButtonElement>(".shape-btn");
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.shape === shape);
    });

    // Update toggle button icon
    const boxIcon = this.shadow.querySelector<SVGElement>(".box-icon");
    const sphereIcon = this.shadow.querySelector<SVGElement>(".sphere-icon");
    if (boxIcon) boxIcon.style.display = shape === "box" ? "block" : "none";
    if (sphereIcon)
      sphereIcon.style.display = shape === "sphere" ? "block" : "none";

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

    const sizeSlider =
      this.shadow.querySelector<HTMLInputElement>(".size-slider");
    const sizeValue = this.shadow.querySelector(".size-value");

    if (sizeSlider) sizeSlider.value = this.selectedSize.toString();
    if (sizeValue) sizeValue.textContent = this.selectedSize.toFixed(1);

    this.shapePreview?.setSize(this.selectedSize);
  }
}

customElements.define("mobile-spawner-menu", MobileSpawnerMenu);
