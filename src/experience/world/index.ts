import * as THREE from "three";
import type Resources from "~/utils/resources";
import type Time from "~/utils/time";
import type Debug from "~/utils/debug";
import type InputState from "~/workers/render/input-state";
import Environment from "~/experience/world/systems/environment";
import Floor from "~/experience/world/objects/floor";
import Fox from "~/experience/world/objects/fox";
import { PlaneShader } from "~/experience/world/objects/plane";

export default class World {
  private scene: THREE.Scene;
  private onReadyCallback: (() => void) | null = null;

  floor!: Floor;
  fox!: Fox;
  environment!: Environment;
  plane!: PlaneShader;

  constructor(
    scene: THREE.Scene,
    resources: Resources,
    time: Time,
    debug: Debug,
    inputState?: InputState,
  ) {
    this.scene = scene;

    resources.on("ready", () => {
      this.floor = new Floor(this.scene, resources);
      this.fox = new Fox(this.scene, resources, time, debug, inputState);
      this.plane = new PlaneShader(this.scene, time, debug);
      this.environment = new Environment(this.scene, resources, debug);

      // Notify that world is ready
      this.onReadyCallback?.();
    });
  }

  /**
   * Set callback for when world objects are created
   */
  onReady(callback: () => void): void {
    this.onReadyCallback = callback;
  }

  /**
   * Get the fox's model for camera following
   */
  getFoxModel(): THREE.Object3D | null {
    return this.fox?.model ?? null;
  }

  dispose(): void {
    this.floor?.dispose();
    this.fox?.dispose();
    this.plane?.dispose();
    this.environment?.dispose();
  }
}
