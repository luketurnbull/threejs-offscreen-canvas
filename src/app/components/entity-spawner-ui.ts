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

import * as THREE from "three";
import { config } from "~/shared/config";

export interface SpawnConfig {
  shape: "box" | "sphere";
  size: number;
}

/**
 * Manages Three.js preview scene for shape visualization.
 * Renders to small canvas on main thread (not worker - overhead exceeds cost).
 */
class ShapePreview {
  private static readonly CANVAS_SIZE = 80;
  private static readonly ROTATION_SPEED = 0.5; // rad/s
  private static readonly CAMERA_DISTANCE = 2.5;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private mesh: THREE.Mesh | null = null;
  private animationId = 0;
  private lastTime = 0;

  private currentShape: "box" | "sphere" = "box";
  private currentSize = 1;

  // Reusable geometries/materials
  private boxGeometry: THREE.BoxGeometry;
  private sphereGeometry: THREE.SphereGeometry;
  private boxMaterial: THREE.MeshStandardMaterial;
  private sphereMaterial: THREE.MeshStandardMaterial;

  constructor(canvas: HTMLCanvasElement) {
    // Renderer - small, no antialiasing needed at this size
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: false,
    });
    this.renderer.setSize(ShapePreview.CANVAS_SIZE, ShapePreview.CANVAS_SIZE);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Scene
    this.scene = new THREE.Scene();

    // Camera - isometric-ish angle
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 10);
    const d = ShapePreview.CAMERA_DISTANCE;
    this.camera.position.set(d * 0.7, d * 0.5, d * 0.7);
    this.camera.lookAt(0, 0, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(5, 5, 5);
    this.scene.add(ambient, directional);

    // Geometries (reuse on shape switch)
    this.boxGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.sphereGeometry = new THREE.SphereGeometry(0.5, 16, 12);

    // Materials matching instanced meshes exactly
    this.boxMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b4513,
      roughness: 0.7,
      metalness: 0.1,
    });
    this.sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x4169e1,
      roughness: 0.6,
      metalness: 0.2,
    });

    this.createMesh();
    this.animate();
  }

  private createMesh(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
    }

    const geometry =
      this.currentShape === "box" ? this.boxGeometry : this.sphereGeometry;
    const material =
      this.currentShape === "box" ? this.boxMaterial : this.sphereMaterial;

    this.mesh = new THREE.Mesh(geometry, material);
    this.applySize();
    this.scene.add(this.mesh);
  }

  private applySize(): void {
    if (!this.mesh) return;
    this.mesh.scale.setScalar(this.currentSize);
  }

  setShape(shape: "box" | "sphere"): void {
    if (this.currentShape === shape) return;
    this.currentShape = shape;
    this.createMesh();
  }

  setSize(size: number): void {
    this.currentSize = size;
    this.applySize();
  }

  private animate = (): void => {
    this.animationId = requestAnimationFrame(this.animate);

    const now = performance.now();
    const delta = (now - this.lastTime) / 1000;
    this.lastTime = now;

    if (this.mesh) {
      this.mesh.rotation.y += ShapePreview.ROTATION_SPEED * delta;
    }

    this.renderer.render(this.scene, this.camera);
  };

  dispose(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = 0;
    }

    this.boxGeometry.dispose();
    this.sphereGeometry.dispose();
    this.boxMaterial.dispose();
    this.sphereMaterial.dispose();
    this.renderer.dispose();

    this.mesh = null;
  }
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

        /* Preview Canvas */
        .preview-section {
          display: flex;
          justify-content: center;
        }

        .preview-canvas {
          width: 80px;
          height: 80px;
          border-radius: 8px;
          background: #1a1a1a;
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
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .shape-icon svg {
          width: 20px;
          height: 20px;
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
      this.shapePreview = new ShapePreview(canvas);
      this.shapePreview.setShape(this.selectedShape);
      this.shapePreview.setSize(this.selectedSize);
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
