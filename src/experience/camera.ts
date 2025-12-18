import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type Sizes from "~/utils/sizes";
import type Time from "~/utils/time";

export default class Camera {
  instance: THREE.PerspectiveCamera;
  controls: OrbitControls;

  constructor(
    sizes: Sizes,
    time: Time,
    scene: THREE.Scene,
    canvas: HTMLCanvasElement,
  ) {
    // Create a new perspective camera instance
    this.instance = new THREE.PerspectiveCamera(
      35,
      sizes.width / sizes.height,
      0.1,
      100,
    );
    this.instance.position.set(6, 4, 8);
    scene.add(this.instance);

    // Create orbit controls
    this.controls = new OrbitControls(this.instance, canvas);
    this.controls.enableDamping = true;

    sizes.on("resize", ({ width, height }) => {
      this.instance.aspect = width / height;
      this.instance.updateProjectionMatrix();
    });

    time.on("tick", () => {
      this.controls.update();
    });
  }
}
