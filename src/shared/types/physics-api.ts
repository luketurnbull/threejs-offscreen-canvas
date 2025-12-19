import type { EntityId, EntitySpawnData, Transform } from "./entity";

// ============================================
// Physics Worker API - exposed via Comlink
// ============================================

/**
 * Physics body configuration
 */
export interface PhysicsBodyConfig {
  type: "static" | "dynamic" | "kinematic";
  colliderType: "cuboid" | "capsule" | "ball" | "trimesh" | "heightfield";
  dimensions: { x: number; y: number; z: number }; // For cuboid
  radius?: number; // For capsule/ball
  height?: number; // For capsule
  mass?: number;
  friction?: number;
  restitution?: number;
}

// ============================================
// Debug Collider - for physics visualization
// ============================================

/**
 * Debug collider shape for visualization in render worker
 */
export type DebugColliderShape =
  | { type: "cuboid"; halfExtents: { x: number; y: number; z: number } }
  | { type: "capsule"; radius: number; halfHeight: number }
  | { type: "ball"; radius: number };

/**
 * Debug collider info passed to render worker for visualization
 */
export interface DebugCollider {
  shape: DebugColliderShape;
  /** Optional offset from the entity's position (e.g., for colliders offset from body) */
  offset?: { x: number; y: number; z: number };
}

/**
 * Floating capsule controller configuration
 *
 * Dynamic rigidbody-based controller using spring-damper forces to float above ground.
 * Provides natural physics interactions with impulse-based movement.
 * Inspired by Toyful Games' Very Very Valet and pmndrs/ecctrl.
 */
export interface FloatingCapsuleConfig {
  // Capsule dimensions
  radius: number;
  halfHeight: number;

  // Floating spring-damper system
  floatingDistance: number;
  rayLength: number;
  springStrength: number;
  springDamping: number;

  // Movement
  moveForce: number;
  sprintMultiplier: number;
  airControlMultiplier: number;
  maxVelocity: number;

  // Jump
  jumpForce: number;
  coyoteTime: number;
  jumpBufferTime: number;

  // Ground detection
  groundedThreshold: number;
  slopeLimit: number;

  // Physics properties
  mass: number;
  friction: number;
  linearDamping: number;
  angularDamping: number;
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
 * Shared buffer references for zero-copy transform sync
 */
export interface SharedBuffers {
  control: SharedArrayBuffer;
  transform: SharedArrayBuffer;
  timing: SharedArrayBuffer;
}

/**
 * Physics Worker API
 */
export interface PhysicsApi {
  /**
   * Initialize the physics world with shared buffers for transform sync
   */
  init(
    gravity: { x: number; y: number; z: number },
    sharedBuffers: SharedBuffers,
  ): Promise<void>;

  /**
   * Spawn an entity with physics body
   */
  spawnEntity(
    entity: EntitySpawnData,
    bodyConfig: PhysicsBodyConfig,
  ): Promise<void>;

  /**
   * Spawn the player character with floating capsule controller
   */
  spawnFloatingPlayer(
    id: EntityId,
    transform: Transform,
    config: FloatingCapsuleConfig,
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
   * Transforms are written directly to SharedArrayBuffer
   */
  start(): void;

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
