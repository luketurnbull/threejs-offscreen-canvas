/**
 * EntitySpawnerUI - Web Component for entity spawn configuration
 *
 * Provides UI controls for:
 * - Shape selection (box/sphere)
 * - Color picker (native HTML5)
 * - Size slider (0.1 - 3.0)
 *
 * Fixed position at bottom-left of screen.
 * Uses Shadow DOM for style isolation.
 */

export interface SpawnConfig {
  shape: "box" | "sphere";
  color: number; // Hex color (e.g., 0x4a90d9)
  size: number; // 0.1 - 3.0
}

export class EntitySpawnerUI extends HTMLElement {
  private shadow: ShadowRoot;
  private selectedShape: "box" | "sphere" = "box";
  private selectedColor: number = 0x4a90d9; // Nice blue default
  private selectedSize: number = 1.0;

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

        /* Color Picker */
        .color-row {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .color-input {
          width: 40px;
          height: 40px;
          border: none;
          border-radius: 8px;
          cursor: pointer;
          padding: 0;
          background: none;
        }

        .color-input::-webkit-color-swatch-wrapper {
          padding: 2px;
        }

        .color-input::-webkit-color-swatch {
          border: 2px solid #444;
          border-radius: 6px;
        }

        .color-input::-moz-color-swatch {
          border: 2px solid #444;
          border-radius: 6px;
        }

        .color-value {
          font-family: monospace;
          font-size: 13px;
          color: #aaa;
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
          <div class="label">Color</div>
          <div class="color-row">
            <input type="color" class="color-input" value="#4a90d9">
            <span class="color-value">#4a90d9</span>
          </div>
        </div>

        <div class="section">
          <div class="label">Size</div>
          <div class="size-row">
            <input type="range" class="size-slider" min="0.1" max="3.0" step="0.1" value="1.0">
            <span class="size-value">1.0</span>
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

    // Color picker
    const colorInput =
      this.shadow.querySelector<HTMLInputElement>(".color-input");
    colorInput?.addEventListener("input", (e) => {
      const target = e.target as HTMLInputElement;
      this.setColorFromHex(target.value);
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

  private setColorFromHex(hexString: string): void {
    // Convert #RRGGBB to 0xRRGGBB
    this.selectedColor = parseInt(hexString.slice(1), 16);

    // Update display
    const colorValue = this.shadow.querySelector(".color-value");
    if (colorValue) {
      colorValue.textContent = hexString;
    }
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
      color: this.selectedColor,
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
   * Programmatically set the color (hex number, e.g., 0xff0000)
   */
  setSelectedColor(color: number): void {
    this.selectedColor = color;

    // Update input and display
    const hexString = "#" + color.toString(16).padStart(6, "0");
    const colorInput =
      this.shadow.querySelector<HTMLInputElement>(".color-input");
    const colorValue = this.shadow.querySelector(".color-value");

    if (colorInput) colorInput.value = hexString;
    if (colorValue) colorValue.textContent = hexString;
  }

  /**
   * Programmatically set the size
   */
  setSelectedSize(size: number): void {
    this.selectedSize = Math.max(0.1, Math.min(3.0, size));

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
