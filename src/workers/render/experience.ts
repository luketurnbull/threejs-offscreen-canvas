import * as THREE from "three";
import type {
  ViewportSize,
  SerializedInputEvent,
  DebugBinding,
  DebugUpdateEvent,
  EntityId,
  TransformUpdateBatch,
} from "~/shared/types";
import type TimeType from "~/utils/time";
import type DebugType from "~/utils/debug";
import type ResourcesType from "~/utils/resources";
import Time from "./time";
import Debug from "./debug";
import Resources from "./resources";
import InputState from "./input-state";
import FollowCamera from "./controls/follow-camera";
import sources from "~/constants/sources";

// Entity components
import Floor from "~/experience/world/objects/floor";
import Fox from "~/experience/world/objects/fox";
import { PlaneShader } from "~/experience/world/objects/plane";
import Environment from "~/experience/world/systems/environment";

/**
 * Transform state for interpolation
 */
interface TransformState {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

/**
 * RenderEntity - Represents a renderable entity in the scene
 */
interface RenderEntity {
  id: EntityId;
  type: string;
  object: THREE.Object3D;
  mixer?: THREE.AnimationMixer;
  // For interpolation
  previousTransform: TransformState;
  targetTransform: TransformState;
  lastUpdateTime: number;
}

/**
 * RenderExperience - Main Three.js scene orchestrator in worker context
 *
 * Manages scene, camera, renderer, and entity-based rendering.
 * Receives transform updates from physics worker.
 * Receives input events from main thread.
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
  private unsubscribeTick: (() => void) | null = null;

  // Entity management
  private entities: Map<EntityId, RenderEntity> = new Map();
  private playerEntityId: EntityId | null = null;

  // Legacy world objects (will be converted to entities)
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
      // Create legacy world objects (floor, environment, plane shader)
      // These don't need physics, so we create them directly
      this.floor = new Floor(
        this.scene,
        this.resources as unknown as ResourcesType,
      );
      this.plane = new PlaneShader(
        this.scene,
        this.time as unknown as TimeType,
        this.debug as unknown as DebugType,
      );
      this.environment = new Environment(
        this.scene,
        this.resources as unknown as ResourcesType,
        this.debug as unknown as DebugType,
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
        this.fox = new Fox(
          this.scene,
          this.resources as unknown as ResourcesType,
          this.time as unknown as TimeType,
          this.debug as unknown as DebugType,
          // Don't pass inputState - movement is now handled by physics
        );
        object = this.fox.model;
        this.playerEntityId = id;

        // Connect follow camera to player
        this.followCamera.setTarget(object);
        break;
      }

      case "ground": {
        // Ground is already created by Floor, just track the entity
        // Create a dummy object to track (floor already exists)
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

    // Initialize transform states for interpolation
    const initialTransform: TransformState = {
      position: object.position.clone(),
      quaternion: object.quaternion.clone(),
    };

    this.entities.set(id, {
      id,
      type,
      object,
      mixer: type === "player" ? this.fox?.mixer : undefined,
      previousTransform: {
        ...initialTransform,
        position: initialTransform.position.clone(),
        quaternion: initialTransform.quaternion.clone(),
      },
      targetTransform: initialTransform,
      lastUpdateTime: performance.now(),
    });

    console.log("[RenderExperience] Spawned entity:", id, type);
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
          entity.object.material.forEach((m) => m.dispose());
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

  applyTransformUpdates(batch: TransformUpdateBatch): void {
    const now = performance.now();

    for (const update of batch.updates) {
      const entity = this.entities.get(update.id);
      if (!entity) continue;

      // Store previous transform (current target becomes previous)
      entity.previousTransform.position.copy(entity.targetTransform.position);
      entity.previousTransform.quaternion.copy(
        entity.targetTransform.quaternion,
      );

      // Set new target transform
      entity.targetTransform.position.set(
        update.position.x,
        update.position.y,
        update.position.z,
      );
      entity.targetTransform.quaternion.set(
        update.rotation.x,
        update.rotation.y,
        update.rotation.z,
        update.rotation.w,
      );

      entity.lastUpdateTime = now;

      // Update animation based on movement for player
      if (entity.type === "player" && this.fox) {
        this.updatePlayerAnimation();
      }
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
    const now = performance.now();
    const physicsInterval = 1000 / 60; // Physics runs at 60Hz

    // Interpolate entity transforms
    for (const entity of this.entities.values()) {
      const timeSinceUpdate = now - entity.lastUpdateTime;
      // Alpha is how far we are between physics updates (0 to 1)
      const alpha = Math.min(timeSinceUpdate / physicsInterval, 1);

      // Interpolate position
      entity.object.position.lerpVectors(
        entity.previousTransform.position,
        entity.targetTransform.position,
        alpha,
      );

      // Interpolate rotation (slerp for quaternions)
      entity.object.quaternion.slerpQuaternions(
        entity.previousTransform.quaternion,
        entity.targetTransform.quaternion,
        alpha,
      );
    }

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

  dispose(): void {
    this.unsubscribeTick?.();
    this.time.dispose();

    // Dispose entities
    for (const [id] of this.entities) {
      this.removeEntity(id);
    }

    // Dispose legacy objects
    this.floor?.dispose();
    this.plane?.dispose();
    this.environment?.dispose();

    this.followCamera.dispose();
    this.renderer.dispose();
    this.debug.dispose();
  }
}
