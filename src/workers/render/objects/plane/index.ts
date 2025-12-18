import * as THREE from "three";
import type Debug from "~/utils/debug";
import type { DebugFolder } from "~/utils/debug";
import type Time from "~/utils/time";
import vertexShader from "./vertex.vert";
import fragmentShader from "./fragment.frag";

export class PlaneShader {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh;
  private material: THREE.RawShaderMaterial;
  private debugFolder?: DebugFolder;
  private unsubscribeTick: (() => void) | null = null;

  private uTime: THREE.Uniform<number> = new THREE.Uniform(0);
  private uColor: THREE.Uniform<THREE.Color> = new THREE.Uniform(
    new THREE.Color(0xffffff),
  );

  constructor(scene: THREE.Scene, time: Time, debug: Debug) {
    this.scene = scene;

    // Create material
    this.material = this.createMaterial();

    // Create geometry
    const geometry = new THREE.PlaneGeometry(1, 1, 32, 32);

    // Create mesh
    this.mesh = new THREE.Mesh(geometry, this.material);

    // Add mesh to scene
    this.scene.add(this.mesh);

    // Updater
    this.update(time);

    // Add debug
    this.addDebug(debug);
  }

  update(time: Time) {
    this.unsubscribeTick = time.on("tick", ({ elapsed }) => {
      this.uTime.value = elapsed * 0.001;
    });
  }

  createMaterial() {
    return new THREE.RawShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: this.uTime,
        uColor: this.uColor,
      },
    });
  }

  addDebug(debug: Debug) {
    if (debug.active) {
      this.debugFolder = debug.ui?.addFolder({
        title: "Plane Shader",
      });

      this.debugFolder?.addBinding(this.uColor, "value").on("change", () => {
        this.material.uniformsNeedUpdate = true;
      });
    }
  }

  dispose(): void {
    this.unsubscribeTick?.();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.debugFolder?.dispose();
    this.scene.remove(this.mesh);
  }
}
