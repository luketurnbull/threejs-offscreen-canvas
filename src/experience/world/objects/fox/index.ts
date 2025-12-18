import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { FolderApi } from "tweakpane";
import type Resources from "~/utils/resources";
import type Time from "~/utils/time";
import type Debug from "~/utils/debug";
import type InputState from "~/workers/render/input-state";

export default class Fox {
  private scene: THREE.Scene;
  private inputState: InputState | null = null;
  private unsubscribeTick: (() => void) | null = null;

  // Movement settings
  private moveSpeed = 3;
  private runSpeedMultiplier = 2;
  private turnSpeed = 3;

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
    time: Time,
    debug: Debug,
    inputState?: InputState,
  ) {
    this.scene = scene;
    this.inputState = inputState ?? null;
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

    // Set update
    this.unsubscribeTick = time.on("tick", ({ delta }) => {
      this.update(delta);
    });
  }

  private update(delta: number): void {
    const deltaSeconds = delta * 0.001;

    // Update animation mixer
    this.mixer.update(deltaSeconds);

    // Handle movement if inputState is available
    if (this.inputState) {
      this.handleMovement(deltaSeconds);
    }
  }

  private handleMovement(deltaSeconds: number): void {
    if (!this.inputState) return;

    const isForward = this.inputState.isKeyDown("w");
    const isTurnLeft = this.inputState.isKeyDown("a");
    const isTurnRight = this.inputState.isKeyDown("d");
    const isRunning = this.inputState.isKeyDown("shift");

    const isMoving = isForward;
    const isTurning = isTurnLeft || isTurnRight;

    // Handle rotation (A/D turns the fox)
    if (isTurnLeft) {
      this.model.rotation.y += this.turnSpeed * deltaSeconds;
    }
    if (isTurnRight) {
      this.model.rotation.y -= this.turnSpeed * deltaSeconds;
    }

    // Handle forward movement (W moves in facing direction)
    if (isForward) {
      const speed = isRunning
        ? this.moveSpeed * this.runSpeedMultiplier
        : this.moveSpeed;

      // Move in the direction the fox is facing
      // Fox model faces +Z in local space, so we use sin/cos based on Y rotation
      const direction = new THREE.Vector3(
        Math.sin(this.model.rotation.y),
        0,
        Math.cos(this.model.rotation.y),
      );

      this.model.position.addScaledVector(direction, speed * deltaSeconds);
    }

    // Update animation based on state
    if (isMoving) {
      const targetAnimation = isRunning ? "running" : "walking";
      if (this.actions.current !== this.actions[targetAnimation]) {
        this.play(targetAnimation);
      }
    } else if (isTurning) {
      // Play walk animation when turning in place
      if (this.actions.current !== this.actions.walking) {
        this.play("walking");
      }
    } else {
      if (this.actions.current !== this.actions.idle) {
        this.play("idle");
      }
    }
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
