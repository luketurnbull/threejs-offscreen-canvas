import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { FolderApi } from "tweakpane";
import type Resources from "~/utils/resources";
import type Time from "~/utils/time";
import type Debug from "~/utils/debug";

/**
 * Fox - Animated fox character mesh
 *
 * Handles rendering and animation only.
 * Movement is controlled by the Physics Worker.
 */
export default class Fox {
  private scene: THREE.Scene;
  private unsubscribeTick: (() => void) | null = null;

  debugFolder: FolderApi | null = null;
  resource: GLTF;
  model: THREE.Group;

  mixer: THREE.AnimationMixer;
  actions: {
    idle: THREE.AnimationAction;
    walking: THREE.AnimationAction;
    running: THREE.AnimationAction;
    current: THREE.AnimationAction;
  };

  constructor(
    scene: THREE.Scene,
    resources: Resources,
    _time: Time,
    debug: Debug,
  ) {
    this.scene = scene;
    this.resource = resources.items.foxModel as GLTF;

    // Set scale
    this.model = this.resource.scene;
    this.model.scale.set(0.02, 0.02, 0.02);

    // Add to scene
    this.scene.add(this.model);

    // Add shadows
    this.model.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
      }
    });

    // Create animation actions
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {
      idle: this.mixer.clipAction(this.resource.animations[0]),
      walking: this.mixer.clipAction(this.resource.animations[1]),
      running: this.mixer.clipAction(this.resource.animations[2]),
      current: this.mixer.clipAction(this.resource.animations[0]),
    };

    // Play idle animation
    this.actions.current.play();

    // Add debug folder
    this.addDebugFolder(debug);

    // Note: Animation mixer is updated externally by RenderExperience
    // Movement is handled by Physics Worker
  }

  addDebugFolder(debug: Debug) {
    if (debug.active && debug.ui) {
      this.debugFolder = debug.ui.addFolder({ title: "fox" });
    }

    if (this.debugFolder) {
      this.debugFolder
        .addButton({ title: "Play Idle" })
        .on("click", () => this.play("idle"));

      this.debugFolder
        .addButton({ title: "Play Walking" })
        .on("click", () => this.play("walking"));

      this.debugFolder
        .addButton({ title: "Play Running" })
        .on("click", () => this.play("running"));
    }
  }

  play(name: "idle" | "walking" | "running") {
    const newAction = this.actions[name];
    const oldAction = this.actions.current;

    newAction.reset();
    newAction.play();
    newAction.crossFadeFrom(oldAction, 0.5, false);

    this.actions.current = newAction;
  }

  dispose(): void {
    this.unsubscribeTick?.();
    this.mixer.stopAllAction();
    this.debugFolder?.dispose();
    this.scene.remove(this.model);
  }
}
