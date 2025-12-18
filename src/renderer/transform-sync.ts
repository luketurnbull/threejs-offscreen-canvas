import * as THREE from "three";
import type { EntityId } from "~/shared/types";
import { SharedTransformBuffer } from "~/shared/buffers";
import type { RenderComponent } from "./entities";

/**
 * TransformSync - Physics-to-render transform interpolation
 *
 * Implements the "Fix Your Timestep!" interpolation pattern:
 * - Reads transforms and timestamps from SharedArrayBuffer
 * - Calculates interpolation alpha based on time since physics frame
 * - Interpolates between PREVIOUS and CURRENT physics states
 *
 * This decouples physics (fixed timestep) from rendering (variable timestep)
 * for smooth motion regardless of frame rate.
 *
 * @see https://gafferongames.com/post/fix_your_timestep/
 */
class TransformSync {
  private sharedBuffer: SharedTransformBuffer;
  private lastPhysicsFrame = 0;

  // Temporary objects for interpolation (avoid allocation in render loop)
  private tempQuatPrev = new THREE.Quaternion();
  private tempQuatCurrent = new THREE.Quaternion();
  private tempPosition = new THREE.Vector3();
  private tempQuaternion = new THREE.Quaternion();

  constructor(sharedBuffer: SharedTransformBuffer) {
    this.sharedBuffer = sharedBuffer;
  }

  /**
   * Rebuild entity map after entities are added/removed
   */
  rebuildEntityMap(): void {
    this.sharedBuffer.rebuildEntityMap();
  }

  /**
   * Get the buffer index for an entity
   */
  getEntityIndex(id: EntityId): number {
    return this.sharedBuffer.getEntityIndex(id);
  }

  /**
   * Update transforms for all entities with interpolation
   *
   * @param entities - Map of entities to update
   * @returns true if a new physics frame was available
   */
  update(entities: Map<EntityId, RenderComponent>): boolean {
    const now = performance.now();
    const currentFrame = this.sharedBuffer.getFrameCounter();
    const newFrameAvailable = currentFrame !== this.lastPhysicsFrame;

    // Read timing information once (same for all entities)
    const timing = this.sharedBuffer.readFrameTiming();

    // Calculate interpolation alpha based on physics timestamps (once for all entities)
    const timeSincePhysicsFrame = now - timing.currentTime;

    // Handle edge case where timing hasn't been initialized yet
    const interval = timing.interval > 0 ? timing.interval : 1000 / 60;

    // Clamp alpha to [0, 1] to prevent overshooting if physics is slow
    const alpha = Math.min(Math.max(timeSincePhysicsFrame / interval, 0), 1);

    // Apply interpolated transforms to all entities with pre-calculated alpha
    for (const entity of entities.values()) {
      this.applyInterpolatedTransform(entity, alpha);
    }

    if (newFrameAvailable) {
      this.lastPhysicsFrame = currentFrame;
    }

    return newFrameAvailable;
  }

  /**
   * Apply interpolated transform to a single entity
   *
   * @param entity - The entity to update
   * @param alpha - Pre-calculated interpolation factor [0, 1]
   */
  private applyInterpolatedTransform(
    entity: RenderComponent,
    alpha: number,
  ): void {
    const bufferIndex = this.sharedBuffer.getEntityIndex(entity.id);
    if (bufferIndex < 0) return;

    // Read both previous and current transforms from shared buffer
    const transforms = this.sharedBuffer.readTransform(bufferIndex);

    // Interpolate position
    this.tempPosition.set(
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
    this.tempQuaternion.slerpQuaternions(
      this.tempQuatPrev,
      this.tempQuatCurrent,
      alpha,
    );

    // Apply to entity
    entity.object.position.copy(this.tempPosition);
    entity.object.quaternion.copy(this.tempQuaternion);

    // Call transform update hook
    entity.onTransformUpdate?.(this.tempPosition, this.tempQuaternion);
  }

  /**
   * Linear interpolation helper
   *
   * @param a - Start value
   * @param b - End value
   * @param t - Interpolation factor [0, 1]
   * @returns Interpolated value
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Reset state - temporary objects will be garbage collected
    this.lastPhysicsFrame = 0;
  }
}

export default TransformSync;
