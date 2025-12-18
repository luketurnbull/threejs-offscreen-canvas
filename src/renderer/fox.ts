import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type Resources from "./resources";

/**
 * Fox - Animated fox character mesh
 *
 * Handles rendering and animation only.
 * Movement is controlled by the Physics Worker.
 * Animations are triggered by RenderExperience based on player input.
 */
export default class Fox {
  private scene: THREE.Scene;

  resource: GLTF;
  model: THREE.Group;

  mixer: THREE.AnimationMixer;
  actions: {
    idle: THREE.AnimationAction;
    walking: THREE.AnimationAction;
    running: THREE.AnimationAction;
    current: THREE.AnimationAction;
  };

  constructor(scene: THREE.Scene, resources: Resources) {
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
    this.mixer.stopAllAction();
    this.scene.remove(this.model);
  }
}
