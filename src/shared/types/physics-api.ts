import type { EntityId, EntitySpawnData, Transform } from "./entity";

// ============================================
// Physics Worker API - exposed via Comlink
// ============================================

/**
 * Physics body configuration
 */
export interface PhysicsBodyConfig {
  type: "static" | "dynamic" | "kinematic";
  colliderType: "cuboid" | "capsule" | "ball" | "trimesh";
  dimensions: { x: number; y: number; z: number }; // For cuboid
  radius?: number; // For capsule/ball
  height?: number; // For capsule
  mass?: number;
  friction?: number;
  restitution?: number;
}

/**
 * Character controller configuration
 */
export interface CharacterControllerConfig {
  capsuleRadius: number;
  capsuleHeight: number;
  stepHeight: number;
  maxSlopeAngle: number;
  minSlopeSlideAngle: number;
}

/**
 * Movement input from main thread
 */
export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  sprint: boolean;
}

/**
 * Physics Worker API
 */
export interface PhysicsApi {
  /**
   * Initialize the physics world
   */
  init(gravity?: { x: number; y: number; z: number }): Promise<void>;

  /**
   * Spawn an entity with physics body
   */
  spawnEntity(
    entity: EntitySpawnData,
    bodyConfig: PhysicsBodyConfig,
  ): Promise<void>;

  /**
   * Spawn the player character with character controller
   */
  spawnPlayer(
    id: EntityId,
    transform: Transform,
    config: CharacterControllerConfig,
  ): Promise<void>;

  /**
   * Remove an entity
   */
  removeEntity(id: EntityId): void;

  /**
   * Update player movement input
   */
  setPlayerInput(input: MovementInput): void;

  /**
   * Start the physics simulation loop
   * @param onUpdate Callback with transform updates each step
   */
  start(onUpdate: (updates: TransformUpdateBatch) => void): void;

  /**
   * Pause the physics simulation
   */
  pause(): void;

  /**
   * Resume the physics simulation
   */
  resume(): void;

  /**
   * Clean up and dispose
   */
  dispose(): void;
}

/**
 * Transform update batch sent from physics to render
 */
export interface TransformUpdateBatch {
  timestamp: number;
  updates: Array<{
    id: EntityId;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  }>;
}
