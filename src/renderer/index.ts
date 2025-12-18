import * as THREE from "three";
import type {
  RenderApi,
  ViewportSize,
  SerializedInputEvent,
  DebugBinding,
  DebugUpdateEvent,
  EntityId,
  SharedBuffers,
} from "~/shared/types";
import { SharedTransformBuffer } from "~/shared/buffers";
import InputState from "./input-state";
import FollowCamera from "./camera";
import Time from "./time";
import Debug from "./debug";
import Resources from "./resources";
import sources from "./sources";

// Scene objects
import Floor from "./objects/floor";
import Fox from "./objects/fox";
import PlaneShader from "./objects/plane";
import Environment from "./environment";

/**
 * RenderEntity - Represents a renderable entity in the scene
 *
 * Note: Transform interpolation is now handled via SharedArrayBuffer which
 * stores both previous and current physics transforms. We no longer need
 * per-entity interpolation state here.
 */
interface RenderEntity {
  id: EntityId;
  type: string;
  object: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
}

/**
 * Renderer - Main Three.js scene orchestrator
 *
 * Manages scene, camera, renderer, and entity-based rendering.
 * Receives transform updates from physics worker via SharedArrayBuffer.
 * Uses timestamp-based interpolation for smooth motion between physics frames.
 *
 * @see https://gafferongames.com/post/fix_your_timestep/
 */
class Renderer {
  private time: Time;
  private debug: Debug;
  private inputState: InputState;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private followCamera: FollowCamera;
  private renderer: THREE.WebGLRenderer;
  private resources: Resources;
  private unsubscribeTick: (() => void) | null = null;

  // Entity management
  private entities: Map<EntityId, RenderEntity> = new Map();
  private playerEntityId: EntityId | null = null;

  // Shared buffer for transform sync (required)
  private sharedBuffer: SharedTransformBuffer;
  private lastPhysicsFrame = 0;

  // Temporary quaternions for interpolation (avoid allocation in render loop)
  private tempQuatPrev = new THREE.Quaternion();
  private tempQuatCurrent = new THREE.Quaternion();

  // Scene objects
  private floor: Floor | null = null;
  private fox: Fox | null = null;
  private plane: PlaneShader | null = null;
  private environment: Environment | null = null;

  // Callbacks
  private onProgress: ((progress: number) => void) | null = null;
  private onReady: (() => void) | null = null;
  private onFrameTiming: ((deltaMs: number) => void) | null = null;

  constructor(
    canvas: OffscreenCanvas,
    viewport: ViewportSize,
    debug: boolean,
    sharedBuffer: SharedTransformBuffer,
    onProgress?: (progress: number) => void,
    onReady?: () => void,
    onFrameTiming?: (deltaMs: number) => void,
  ) {
    this.sharedBuffer = sharedBuffer;
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
      // Create scene objects (floor, environment, plane shader)
      this.floor = new Floor(this.scene, this.resources);
      this.plane = new PlaneShader(this.scene, this.time, this.debug);
      this.environment = new Environment(
        this.scene,
        this.resources,
        this.debug,
      );

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

  // ============================================
  // Entity Management
  // ============================================

  async spawnEntity(
    id: EntityId,
    type: string,
    _data?: Record<string, unknown>,
  ): Promise<void> {
    // Wait for resources if not ready
    if (!this.resources.isReady) {
      await new Promise<void>((resolve) => {
        this.resources.on("ready", () => resolve());
      });
    }

    let object: THREE.Object3D;

    switch (type) {
      case "player": {
        // Create fox as the player entity
        this.fox = new Fox(this.scene, this.resources);
        object = this.fox.model;
        this.playerEntityId = id;

        // Connect follow camera to player
        this.followCamera.setTarget(object);
        break;
      }

      case "ground": {
        // Ground is already created by Floor, just track the entity
        object = new THREE.Object3D();
        object.visible = false;
        this.scene.add(object);
        break;
      }

      default: {
        // Create a placeholder cube for unknown entity types
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
        object = new THREE.Mesh(geometry, material);
        object.castShadow = true;
        object.receiveShadow = true;
        this.scene.add(object);
        break;
      }
    }

    this.entities.set(id, {
      id,
      type,
      object,
      mixer: type === "player" ? this.fox?.mixer : undefined,
    });

    // Rebuild shared buffer entity map to get updated indices
    this.sharedBuffer.rebuildEntityMap();

    console.log("[Renderer] Spawned entity:", id, type);
  }

  removeEntity(id: EntityId): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    if (entity.type === "player" && this.fox) {
      this.fox.dispose();
      this.fox = null;
    } else {
      this.scene.remove(entity.object);
      if (entity.object instanceof THREE.Mesh) {
        entity.object.geometry.dispose();
        if (Array.isArray(entity.object.material)) {
          entity.object.material?.forEach((m) => m?.dispose());
        } else {
          entity.object.material.dispose();
        }
      }
    }

    this.entities.delete(id);

    if (this.playerEntityId === id) {
      this.playerEntityId = null;
      this.followCamera.setTarget(null);
    }
  }

  private updatePlayerAnimation(): void {
    if (!this.fox || !this.inputState) return;

    const isForward = this.inputState.isKeyDown("w");
    const isBackward = this.inputState.isKeyDown("s");
    const isTurnLeft = this.inputState.isKeyDown("a");
    const isTurnRight = this.inputState.isKeyDown("d");
    const isRunning = this.inputState.isKeyDown("shift");

    const isMoving = isForward || isBackward;
    const isTurning = isTurnLeft || isTurnRight;

    if (isMoving) {
      const targetAnimation = isRunning ? "running" : "walking";
      if (this.fox.actions.current !== this.fox.actions[targetAnimation]) {
        this.fox.play(targetAnimation);
      }
    } else if (isTurning) {
      if (this.fox.actions.current !== this.fox.actions.walking) {
        this.fox.play("walking");
      }
    } else {
      if (this.fox.actions.current !== this.fox.actions.idle) {
        this.fox.play("idle");
      }
    }
  }

  getPlayerEntityId(): EntityId | null {
    return this.playerEntityId;
  }

  private update(delta: number): void {
    // Read transforms from SharedArrayBuffer with timestamp-based interpolation
    this.readTransformsFromSharedBuffer();

    // Update animation mixers
    const deltaSeconds = delta * 0.001;
    if (this.fox) {
      this.fox.mixer.update(deltaSeconds);
    }

    // Update follow camera
    this.followCamera.update();

    // Render
    this.renderer.render(this.scene, this.camera);
    this.onFrameTiming?.(delta);
  }

  /**
   * Linear interpolation helper
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Read transforms from SharedArrayBuffer with timestamp-based interpolation
   *
   * This implements the "Fix Your Timestep!" interpolation pattern:
   * - Physics writes timestamps along with transforms
   * - Render calculates alpha based on time since physics frame
   * - Interpolates between PREVIOUS and CURRENT physics states (not rendered state)
   *
   * This ensures smooth motion without discontinuities when new physics frames arrive.
   */
  private readTransformsFromSharedBuffer(): void {
    const now = performance.now();
    const currentFrame = this.sharedBuffer.getFrameCounter();
    const newFrameAvailable = currentFrame !== this.lastPhysicsFrame;

    // Read timing information from physics
    const timing = this.sharedBuffer.readFrameTiming();

    // Calculate interpolation alpha based on physics timestamps
    // This gives us smooth 0→1 progress between physics frames
    const timeSincePhysicsFrame = now - timing.currentTime;

    // Handle edge case where timing hasn't been initialized yet
    const interval = timing.interval > 0 ? timing.interval : 1000 / 60;

    // Clamp alpha to [0, 1] to prevent overshooting if physics is slow
    const alpha = Math.min(Math.max(timeSincePhysicsFrame / interval, 0), 1);

    for (const entity of this.entities.values()) {
      const bufferIndex = this.sharedBuffer.getEntityIndex(entity.id);
      if (bufferIndex < 0) continue;

      // Read both previous and current transforms from shared buffer
      const transforms = this.sharedBuffer.readTransform(bufferIndex);

      // Interpolate position between PREVIOUS and CURRENT physics states
      // This is the key difference from before: we interpolate between
      // two known physics states, not between rendered and target
      entity.object.position.set(
        this.lerp(transforms.previous.posX, transforms.current.posX, alpha),
        this.lerp(transforms.previous.posY, transforms.current.posY, alpha),
        this.lerp(transforms.previous.posZ, transforms.current.posZ, alpha),
      );

      // Spherical interpolation for quaternion rotation
      this.tempQuatPrev.set(
        transforms.previous.rotX,
        transforms.previous.rotY,
        transforms.previous.rotZ,
        transforms.previous.rotW,
      );
      this.tempQuatCurrent.set(
        transforms.current.rotX,
        transforms.current.rotY,
        transforms.current.rotZ,
        transforms.current.rotW,
      );
      entity.object.quaternion.slerpQuaternions(
        this.tempQuatPrev,
        this.tempQuatCurrent,
        alpha,
      );

      // Update animation for player when new physics frame arrives
      if (newFrameAvailable && entity.type === "player" && this.fox) {
        this.updatePlayerAnimation();
      }
    }

    if (newFrameAvailable) {
      this.lastPhysicsFrame = currentFrame;
    }
  }

  dispose(): void {
    this.unsubscribeTick?.();
    this.time.dispose();

    // Dispose entities
    for (const [id] of this.entities) {
      this.removeEntity(id);
    }

    // Dispose scene objects
    this.floor?.dispose();
    this.plane?.dispose();
    this.environment?.dispose();

    this.followCamera.dispose();
    this.renderer.dispose();
    this.debug.dispose();
  }
}

// ============================================
// API Factory (used by worker entry point)
// ============================================

let renderer: Renderer | null = null;
let sharedBuffer: SharedTransformBuffer | null = null;

/**
 * Creates the RenderApi for Comlink exposure
 */
export function createRenderApi(): RenderApi {
  return {
    async init(
      canvas: OffscreenCanvas,
      viewport: ViewportSize,
      debug: boolean,
      sharedBuffers: SharedBuffers,
      onProgress?: (progress: number) => void,
      onReady?: () => void,
      onFrameTiming?: (deltaMs: number) => void,
    ): Promise<void> {
      sharedBuffer = new SharedTransformBuffer(
        sharedBuffers.control,
        sharedBuffers.transform,
        sharedBuffers.timing,
      );

      renderer = new Renderer(
        canvas,
        viewport,
        debug,
        sharedBuffer,
        onProgress,
        onReady,
        onFrameTiming,
      );
    },

    resize(viewport: ViewportSize): void {
      renderer?.resize(viewport);
    },

    handleInput(event: SerializedInputEvent): void {
      renderer?.handleInput(event);
    },

    async getDebugBindings(): Promise<DebugBinding[]> {
      return renderer?.getDebugBindings() ?? [];
    },

    updateDebug(event: DebugUpdateEvent): void {
      renderer?.updateDebug(event);
    },

    triggerDebugAction(id: string): void {
      renderer?.triggerDebugAction(id);
    },

    async spawnEntity(
      id: EntityId,
      type: string,
      data?: Record<string, unknown>,
    ): Promise<void> {
      await renderer?.spawnEntity(id, type, data);
    },

    removeEntity(id: EntityId): void {
      renderer?.removeEntity(id);
    },

    async getPlayerEntityId(): Promise<EntityId | null> {
      return renderer?.getPlayerEntityId() ?? null;
    },

    dispose(): void {
      renderer?.dispose();
      renderer = null;
    },
  };
}
