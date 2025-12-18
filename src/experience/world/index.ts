import * as THREE from "three";
import type Resources from "~/utils/resources";
import type Time from "~/utils/time";
import type Debug from "~/utils/debug";
import Environment from "~/experience/world/systems/environment";
import Floor from "~/experience/world/objects/floor";
import Fox from "~/experience/world/objects/fox";
import { PlaneShader } from "~/experience/world/objects/plane";

/**
 * World - Scene content container
 *
 * Note: This is now only used for non-physics objects (floor texture, environment).
 * Physics-driven entities (player, dynamic objects) are spawned via RenderExperience.
 */
export default class World {
  private scene: THREE.Scene;

  floor: Floor;
  fox: Fox;
  environment: Environment;
  plane: PlaneShader;

  constructor(
    scene: THREE.Scene,
    resources: Resources,
    time: Time,
    debug: Debug,
  ) {
    this.scene = scene;

    // Resources are already loaded when World is constructed
    // (Experience creates World inside resources.on("ready"))
    this.floor = new Floor(this.scene, resources);
    this.fox = new Fox(this.scene, resources, time, debug);
    this.plane = new PlaneShader(this.scene, time, debug);
    this.environment = new Environment(this.scene, resources, debug);
  }

  /**
   * Get the fox's model for camera following
   */
  getFoxModel(): THREE.Object3D {
    return this.fox.model;
  }

  dispose(): void {
    this.floor?.dispose();
    this.fox?.dispose();
    this.plane?.dispose();
    this.environment?.dispose();
  }
}
