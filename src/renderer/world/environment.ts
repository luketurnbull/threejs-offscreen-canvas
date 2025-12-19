import * as THREE from "three/webgpu";
import type Resources from "../systems/resources";
import type Debug from "../systems/debug";
import type { DebugFolder } from "../systems/debug";
import { config } from "~/shared/config";

export default class Environment {
  private scene: THREE.Scene;
  private debugFolder: DebugFolder | null = null;

  // Light offset from target (maintains consistent shadow direction)
  private lightOffset = new THREE.Vector3(20, 30, -15);

  // Shadow settings (public for debug binding)
  shadowCameraSize = config.shadows.cameraSize;
  shadowNormalBias = 0.05;

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

    // Shadow camera frustum - smaller = sharper shadows
    // 4096 map / 30 units = ~136 pixels per unit (good quality)
    this.updateShadowCamera();

    this.sunLight.shadow.mapSize.set(
      config.shadows.mapSize,
      config.shadows.mapSize,
    );
    this.sunLight.shadow.normalBias = this.shadowNormalBias;

    // Position light high and far for broad coverage
    this.sunLight.position.copy(this.lightOffset);

    // Add target for shadow to follow (will be updated each frame)
    this.sunLight.target = new THREE.Object3D();
    this.scene.add(this.sunLight.target);

    this.scene.add(this.sunLight);

    // Add environment map
    this.environmentMap = {
      intensity: 0.4,
      texture: resources.items.environmentMapTexture as THREE.CubeTexture,
    };
    this.environmentMap.texture.colorSpace = THREE.SRGBColorSpace;
    this.scene.environment = this.environmentMap.texture;
    this.scene.environmentIntensity = this.environmentMap.intensity;

    // Update existing materials
    this.updateMaterials();

    // Add debug
    this.addDebug();
  }

  /**
   * Update shadow camera frustum based on current settings
   */
  updateShadowCamera(): void {
    this.sunLight.shadow.camera.left = -this.shadowCameraSize;
    this.sunLight.shadow.camera.right = this.shadowCameraSize;
    this.sunLight.shadow.camera.top = this.shadowCameraSize;
    this.sunLight.shadow.camera.bottom = -this.shadowCameraSize;
    this.sunLight.shadow.camera.near = 0.1;
    this.sunLight.shadow.camera.far = 100;
    this.sunLight.shadow.camera.updateProjectionMatrix();
  }

  /**
   * Update shadow camera to follow a target position
   * Call this each frame with the player/camera target position
   */
  updateShadowTarget(targetPosition: THREE.Vector3): void {
    // Move light to follow target, maintaining offset
    this.sunLight.position.copy(targetPosition).add(this.lightOffset);

    // Point light at target
    this.sunLight.target.position.copy(targetPosition);
  }

  updateMaterials() {
    // Update global scene environment intensity (affects all PBR materials)
    this.scene.environmentIntensity = this.environmentMap.intensity;

    // Also update individual materials for any that override envMapIntensity
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

      this.debugFolder.addBinding(this.lightOffset, "x", {
        label: "sunLightOffsetX",
        min: -50,
        max: 50,
        step: 0.5,
      });

      this.debugFolder.addBinding(this.lightOffset, "y", {
        label: "sunLightOffsetY",
        min: 0,
        max: 100,
        step: 0.5,
      });

      this.debugFolder.addBinding(this.lightOffset, "z", {
        label: "sunLightOffsetZ",
        min: -50,
        max: 50,
        step: 0.5,
      });

      this.debugFolder
        .addBinding(this.environmentMap, "intensity", {
          label: "envMapIntensity",
          min: 0,
          max: 4,
          step: 0.001,
        })
        .on("change", () => this.updateMaterials());

      // Shadow controls
      this.debugFolder
        .addBinding(this, "shadowCameraSize", {
          label: "Shadow Size",
          min: 5,
          max: 50,
          step: 1,
        })
        .on("change", () => this.updateShadowCamera());

      this.debugFolder
        .addBinding(this, "shadowNormalBias", {
          label: "Shadow Bias",
          min: 0,
          max: 0.1,
          step: 0.001,
        })
        .on("change", () => {
          this.sunLight.shadow.normalBias = this.shadowNormalBias;
        });
    }
  }

  dispose(): void {
    this.sunLight.dispose();
    this.debugFolder?.dispose();
    this.scene.remove(this.sunLight);
    this.scene.environment = null;
  }
}
