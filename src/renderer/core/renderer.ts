import * as THREE from "three";
import type { ViewportSize } from "~/shared/types";
import { config } from "~/shared/config";

/**
 * Renderer - WebGLRenderer wrapper
 *
 * Responsible for:
 * - Creating and configuring THREE.WebGLRenderer
 * - Handling viewport resizing
 * - Rendering scene/camera pairs
 *
 * This is a thin wrapper that exposes the WebGLRenderer as `instance`
 * for cases where direct access is needed.
 *
 * Note: Three.js WebGLRenderer accepts OffscreenCanvas natively since r128+.
 * The type assertion is needed due to @types/three not including OffscreenCanvas
 * in the WebGLRendererParameters.canvas type definition.
 */
class Renderer {
  readonly instance: THREE.WebGLRenderer;

  constructor(canvas: OffscreenCanvas, viewport: ViewportSize) {
    // OffscreenCanvas is natively supported by Three.js WebGLRenderer
    // Type assertion needed due to incomplete @types/three definitions
    this.instance = new THREE.WebGLRenderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      antialias: true,
      powerPreference: "high-performance",
    });

    // Tone mapping for realistic lighting
    this.instance.toneMapping = THREE.CineonToneMapping;
    this.instance.toneMappingExposure = config.renderer.toneMappingExposure;

    // Shadow configuration
    this.instance.shadowMap.enabled = config.shadows.enabled;
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap;

    // Background color
    this.instance.setClearColor(config.renderer.clearColor);

    // Viewport setup
    const pixelRatio = Math.min(
      viewport.pixelRatio,
      config.renderer.maxPixelRatio,
    );
    this.instance.setPixelRatio(pixelRatio);
    this.instance.setSize(viewport.width, viewport.height, false);
  }

  resize(viewport: ViewportSize): void {
    this.instance.setSize(viewport.width, viewport.height, false);
    const pixelRatio = Math.min(
      viewport.pixelRatio,
      config.renderer.maxPixelRatio,
    );
    this.instance.setPixelRatio(pixelRatio);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.instance.render(scene, camera);
  }

  dispose(): void {
    this.instance.dispose();
  }
}

export default Renderer;
