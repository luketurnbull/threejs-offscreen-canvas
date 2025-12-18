import * as THREE from "three";
import type {
  ViewportSize,
  SerializedInputEvent,
  DebugBinding,
  DebugUpdateEvent,
} from "~/shared/types";
import type TimeType from "~/utils/time";
import type DebugType from "~/utils/debug";
import type ResourcesType from "~/utils/resources";
import type InputStateType from "./input-state";
import Time from "./time";
import Debug from "./debug";
import Resources from "./resources";
import InputState from "./input-state";
import FollowCamera from "./controls/follow-camera";
import sources from "~/constants/sources";
import World from "~/experience/world";

/**
 * RenderExperience - Main Three.js scene orchestrator in worker context
 *
 * Manages scene, camera, renderer, and world.
 * Receives input events and debug updates from main thread.
 */
export default class RenderExperience {
  private time: Time;
  private debug: Debug;
  private inputState: InputState;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private followCamera: FollowCamera;
  private renderer: THREE.WebGLRenderer;
  private resources: Resources;
  private world: World | null = null;
  private unsubscribeTick: (() => void) | null = null;

  private onProgress: ((progress: number) => void) | null = null;
  private onReady: (() => void) | null = null;
  private onFrameTiming: ((deltaMs: number) => void) | null = null;

  constructor(
    canvas: OffscreenCanvas,
    viewport: ViewportSize,
    debug: boolean,
    onProgress?: (progress: number) => void,
    onReady?: () => void,
    onFrameTiming?: (deltaMs: number) => void,
  ) {
    this.onProgress = onProgress ?? null;
    this.onReady = onReady ?? null;
    this.onFrameTiming = onFrameTiming ?? null;

    // Initialize time
    this.time = new Time();

    // Initialize debug
    this.debug = new Debug(debug);

    // Initialize input state
    this.inputState = new InputState();

    // Create scene
    this.scene = new THREE.Scene();

    // Create camera
    this.camera = new THREE.PerspectiveCamera(
      35,
      viewport.width / viewport.height,
      0.1,
      100,
    );
    this.camera.position.set(0, 4, 8);
    this.scene.add(this.camera);

    // Create follow camera controller
    this.followCamera = new FollowCamera(this.camera, {
      distance: 10,
      height: 5,
      lookAtHeight: 1,
      damping: 0.1,
    });

    // Create renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: canvas as unknown as HTMLCanvasElement,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.toneMapping = THREE.CineonToneMapping;
    this.renderer.toneMappingExposure = 1.75;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor("#211d20");
    this.renderer.setPixelRatio(viewport.pixelRatio);
    this.renderer.setSize(viewport.width, viewport.height, false);

    // Initialize resources
    this.resources = new Resources(sources);

    this.resources.on("progress", ({ progress }) => {
      this.onProgress?.(progress);
    });

    this.resources.on("ready", () => {
      this.world = new World(
        this.scene,
        this.resources as unknown as ResourcesType,
        this.time as unknown as TimeType,
        this.debug as unknown as DebugType,
        this.inputState as InputStateType,
      );

      // Connect follow camera to fox
      const foxModel = this.world.getFoxModel();
      this.followCamera.setTarget(foxModel);

      this.onReady?.();
    });

    // Start render loop
    this.unsubscribeTick = this.time.on("tick", ({ delta }) => {
      this.update(delta);
    });
  }

  resize(viewport: ViewportSize): void {
    this.camera.aspect = viewport.width / viewport.height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(viewport.width, viewport.height, false);
    this.renderer.setPixelRatio(viewport.pixelRatio);
  }

  handleInput(event: SerializedInputEvent): void {
    this.inputState.handleEvent(event);
  }

  getDebugBindings(): DebugBinding[] {
    return this.debug.getBindings();
  }

  updateDebug(event: DebugUpdateEvent): void {
    this.debug.applyUpdate(event);
  }

  triggerDebugAction(id: string): void {
    this.debug.triggerAction(id);
  }

  private update(delta: number): void {
    // Update follow camera
    this.followCamera.update();

    // Render
    this.renderer.render(this.scene, this.camera);
    this.onFrameTiming?.(delta);
  }

  dispose(): void {
    this.unsubscribeTick?.();
    this.time.dispose();
    this.world?.dispose();
    this.followCamera.dispose();
    this.renderer.dispose();
    this.debug.dispose();
  }
}
