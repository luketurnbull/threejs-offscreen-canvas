import * as THREE from "three";
import type Resources from "./resources";
import type Debug from "./debug";
import type { DebugFolder } from "./debug";
import { config } from "~/shared/config";

export default class Environment {
  private scene: THREE.Scene;
  private debugFolder: DebugFolder | null = null;

  sunLight: THREE.DirectionalLight;
  environmentMap: {
    intensity: number;
    texture: THREE.CubeTexture;
  };

  constructor(scene: THREE.Scene, resources: Resources, debug: Debug) {
    this.scene = scene;

    // Create debug folder
    if (debug.active && debug.ui) {
      this.debugFolder = debug.ui.addFolder({ title: "Environment" });
    }

    // Add sun light
    this.sunLight = new THREE.DirectionalLight("#ffffff", 4);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.camera.far = 15;
    this.sunLight.shadow.mapSize.set(
      config.shadows.mapSize,
      config.shadows.mapSize,
    );
    this.sunLight.shadow.normalBias = 0.05;
    this.sunLight.position.set(3.5, 2, -1.25);
    this.scene.add(this.sunLight);

    // Add environment map
    this.environmentMap = {
      intensity: 0.4,
      texture: resources.items.environmentMapTexture as THREE.CubeTexture,
    };
    this.environmentMap.texture.colorSpace = THREE.SRGBColorSpace;
    this.scene.environment = this.environmentMap.texture;

    // Update materials
    this.updateMaterials();

    // Add debug
    this.addDebug();
  }

  updateMaterials() {
    this.scene.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.material instanceof THREE.MeshStandardMaterial
      ) {
        child.material.envMap = this.environmentMap.texture;
        child.material.envMapIntensity = this.environmentMap.intensity;
        child.material.needsUpdate = true;
      }
    });
  }

  addDebug() {
    if (this.debugFolder) {
      this.debugFolder.addBinding(this.sunLight, "intensity", {
        label: "sunLightIntensity",
        min: 0,
        max: 10,
        step: 0.001,
      });

      this.debugFolder.addBinding(this.sunLight.position, "x", {
        label: "sunLightX",
        min: -5,
        max: 5,
        step: 0.001,
      });

      this.debugFolder.addBinding(this.sunLight.position, "y", {
        label: "sunLightY",
        min: -5,
        max: 5,
        step: 0.001,
      });

      this.debugFolder.addBinding(this.sunLight.position, "z", {
        label: "sunLightZ",
        min: -5,
        max: 5,
        step: 0.001,
      });

      this.debugFolder
        .addBinding(this.environmentMap, "intensity", {
          label: "envMapIntensity",
          min: 0,
          max: 4,
          step: 0.001,
        })
        .on("change", () => this.updateMaterials());
    }
  }

  dispose(): void {
    this.sunLight.dispose();
    this.debugFolder?.dispose();
    this.scene.remove(this.sunLight);
    this.scene.environment = null;
  }
}
