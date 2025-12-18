import * as THREE from "three";
import type Sizes from "~/utils/sizes";
import type Debug from "~/utils/debug";
import type Camera from "~/experience/camera";
import type Time from "~/utils/time";

export default class Renderer {
  private debug: Debug;
  private unsubscribeResize: (() => void) | null = null;
  private unsubscribeTick: (() => void) | null = null;

  scene: THREE.Scene;
  camera: Camera;
  instance: THREE.WebGLRenderer;

  constructor(
    sizes: Sizes,
    time: Time,
    scene: THREE.Scene,
    camera: Camera,
    canvas: HTMLCanvasElement,
    debug: Debug,
  ) {
    // Set dependencies
    this.scene = scene;
    this.camera = camera;
    this.debug = debug;

    // Initialize renderer
    this.instance = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });

    // Settings
    this.instance.toneMapping = THREE.CineonToneMapping;
    this.instance.toneMappingExposure = 1.75;
    this.instance.shadowMap.enabled = true;
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap;
    this.instance.setClearColor("#211d20");

    this.resize(sizes.width, sizes.height, sizes.pixelRatio);

    this.unsubscribeResize = sizes.on(
      "resize",
      ({ width, height, pixelRatio }) => {
        this.resize(width, height, pixelRatio);
      },
    );

    this.unsubscribeTick = time.on("tick", () => {
      this.render();
    });
  }

  resize(width: number, height: number, pixelRatio: number) {
    this.instance.setSize(width, height);
    this.instance.setPixelRatio(pixelRatio);
  }

  render() {
    this.debug.begin();
    this.instance.render(this.scene, this.camera.instance);
    this.debug.end();
  }

  dispose(): void {
    this.unsubscribeResize?.();
    this.unsubscribeTick?.();
    this.instance.dispose();
  }
}
