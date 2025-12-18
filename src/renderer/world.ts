import * as THREE from "three";
import type { EntityId, DebugCollider } from "~/shared/types";
import type Resources from "./resources";
import type Time from "./time";
import type Debug from "./debug";
import type InputState from "./input-state";
import type Camera from "./camera";

// Entity system
import {
  EntityFactory,
  type RenderComponent,
  type EntityContext,
} from "./entities";

// Scene objects (non-entity visuals)
import Floor from "./objects/floor";
import PlaneShader from "./objects/plane";
import Environment from "./environment";
import PhysicsDebugRenderer from "./physics-debug-renderer";

/**
 * Context passed to World for creating entities and scene objects
 */
export interface WorldContext {
  scene: THREE.Scene;
  resources: Resources;
  time: Time;
  debug: Debug;
  inputState: InputState;
  camera: Camera;
}

/**
 * World - Entity and scene object management
 *
 * Responsible for:
 * - Creating and managing entities via EntityFactory
 * - Creating static scene objects (floor, plane, environment)
 * - Entity lifecycle (spawn, remove, update)
 * - Calling entity lifecycle hooks (onRenderFrame, onPhysicsFrame)
 * - Tracking player entity for camera following
 */
class World {
  private context: WorldContext;

  // Entity management
  private entities: Map<EntityId, RenderComponent> = new Map();
  private entityFactory: EntityFactory | null = null;
  private playerEntityId: EntityId | null = null;

  // Debug colliders for physics visualization
  private debugColliders: Map<EntityId, DebugCollider> = new Map();
  private physicsDebugRenderer: PhysicsDebugRenderer;

  // Scene objects (non-entity visuals that don't need physics sync)
  private sceneObjects: {
    floor: Floor | null;
    plane: PlaneShader | null;
    environment: Environment | null;
  } = { floor: null, plane: null, environment: null };

  constructor(context: WorldContext) {
    this.context = context;
    this.physicsDebugRenderer = new PhysicsDebugRenderer(context.scene);
  }

  /**
   * Create scene objects after resources are loaded
   * Should be called when resources emit 'ready'
   */
  createSceneObjects(): void {
    const { scene, resources, time, debug, inputState } = this.context;

    // Create entity context and factory
    const entityContext: EntityContext = {
      scene,
      resources,
      time,
      debug,
      inputState,
    };
    this.entityFactory = new EntityFactory(entityContext);

    // Create non-entity scene objects
    this.sceneObjects.floor = new Floor(scene, resources);
    this.sceneObjects.plane = new PlaneShader(scene, time, debug);
    this.sceneObjects.environment = new Environment(scene, resources, debug);

    // Setup physics debug toggle in debug UI
    this.setupPhysicsDebugUI();
  }

  // Physics debug state for UI binding (synced in update loop)
  private physicsDebugState = { visible: false };

  /**
   * Setup physics debug controls in the debug UI
   */
  private setupPhysicsDebugUI(): void {
    const { debug } = this.context;
    if (!debug.active || !debug.ui) return;

    const folder = debug.ui.addFolder({ title: "Physics" });
    folder.addBinding(this.physicsDebugState, "visible", {
      label: "Show Colliders",
    });
  }

  /**
   * Spawn a new entity
   */
  async spawnEntity(
    id: EntityId,
    type: string,
    data?: Record<string, unknown>,
    debugCollider?: DebugCollider,
  ): Promise<void> {
    if (!this.entityFactory) {
      throw new Error("World not initialized - call createSceneObjects first");
    }

    // Create entity via factory
    const entity = await this.entityFactory.create(id, type, data);
    this.entities.set(id, entity);

    // Store debug collider and add debug mesh
    if (debugCollider) {
      this.debugColliders.set(id, debugCollider);
      this.physicsDebugRenderer.addEntity(id, debugCollider);
    }

    // Track player entity for camera following
    if (type === "player") {
      this.playerEntityId = id;
      this.context.camera.setTarget(entity.object);
    }
  }

  /**
   * Remove an entity
   */
  removeEntity(id: EntityId): void {
    const entity = this.entities.get(id);
    if (!entity) return;

    // Use entity's own dispose method
    entity.dispose();
    this.entities.delete(id);
    this.debugColliders.delete(id);
    this.physicsDebugRenderer.removeEntity(id);

    if (this.playerEntityId === id) {
      this.playerEntityId = null;
      this.context.camera.setTarget(null);
    }
  }

  /**
   * Get the player entity ID
   */
  getPlayerEntityId(): EntityId | null {
    return this.playerEntityId;
  }

  /**
   * Get all entities (for TransformSync)
   */
  getEntities(): Map<EntityId, RenderComponent> {
    return this.entities;
  }

  /**
   * Get all debug colliders (for PhysicsDebugRenderer)
   */
  getDebugColliders(): Map<EntityId, DebugCollider> {
    return this.debugColliders;
  }

  /**
   * Update all entities
   *
   * @param delta - Time since last frame in milliseconds
   * @param elapsed - Total elapsed time in milliseconds
   * @param newPhysicsFrame - Whether a new physics frame is available
   */
  update(delta: number, elapsed: number, newPhysicsFrame: boolean): void {
    const deltaSeconds = delta * 0.001;

    for (const entity of this.entities.values()) {
      // Update animation mixers for any entity that has one
      if (entity.mixer) {
        entity.mixer.update(deltaSeconds);
      }

      // Call render frame hook (for time-based updates like shaders)
      entity.onRenderFrame?.(delta, elapsed);

      // Call physics frame hook when new physics data arrives
      if (newPhysicsFrame) {
        entity.onPhysicsFrame?.(this.context.inputState);
      }
    }

    // Sync physics debug visibility from UI state
    if (
      this.physicsDebugState.visible !== this.physicsDebugRenderer.isVisible()
    ) {
      this.physicsDebugRenderer.setVisible(this.physicsDebugState.visible);
    }

    // Update physics debug visualization positions
    this.physicsDebugRenderer.update(this.entities);
  }

  /**
   * Toggle physics debug visualization
   */
  setPhysicsDebugVisible(visible: boolean): void {
    this.physicsDebugRenderer.setVisible(visible);
  }

  /**
   * Get physics debug visibility state
   */
  isPhysicsDebugVisible(): boolean {
    return this.physicsDebugRenderer.isVisible();
  }

  /**
   * Toggle physics debug visualization
   */
  togglePhysicsDebug(): void {
    this.physicsDebugRenderer.toggle();
  }

  /**
   * Dispose of all entities and scene objects
   */
  dispose(): void {
    // Dispose all entities
    for (const entity of this.entities.values()) {
      entity.dispose();
    }
    this.entities.clear();

    // Dispose scene objects
    this.sceneObjects.floor?.dispose();
    this.sceneObjects.plane?.dispose();
    this.sceneObjects.environment?.dispose();

    // Dispose physics debug renderer
    this.physicsDebugRenderer.dispose();
  }
}

export default World;
