import * as THREE from "three";
import Camera from "~/experience/camera";
import Debug from "~/utils/debug";
import Resources from "~/utils/resources";
import Renderer from "~/experience/renderer";
import Sizes from "~/utils/sizes";
import sources from "~/constants/sources";
import Time from "~/utils/time";
import World from "~/experience/world";

export default class Experience {
  private canvas: HTMLCanvasElement;

  debug: Debug;
  sizes: Sizes;
  time: Time;
  scene: THREE.Scene;
  resources: Resources;
  camera: Camera;
  renderer: Renderer;
  world: World;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;

    // Utils
    this.debug = new Debug();
    this.sizes = new Sizes();
    this.time = new Time();
    this.resources = new Resources(sources);

    // Create Scene
    this.scene = new THREE.Scene();

    // Create Camera
    this.camera = new Camera(this.sizes, this.time, this.scene, this.canvas);

    // Create Renderer
    this.renderer = new Renderer(
      this.sizes,
      this.time,
      this.scene,
      this.camera,
      this.canvas,
      this.debug,
    );

    // Create World
    this.world = new World(this.scene, this.resources, this.time, this.debug);
  }

  dispose(): void {
    // Dispose world objects
    this.world.dispose();

    // Dispose camera controls
    this.camera.controls.dispose();

    // Dispose renderer
    this.renderer.dispose();

    // Dispose debug UI
    this.debug.dispose();
  }
}
