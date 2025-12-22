import * as THREE from "three";
import type { EntityId } from "~/shared/types";

/**
 * InstancedSpheres - Efficiently renders many spheres using GPU instancing
 *
 * Uses THREE.InstancedMesh for single draw call rendering of hundreds of spheres.
 * Each sphere's transform is synced from the physics worker via SharedArrayBuffer.
 *
 * Features:
 * - Per-instance radius via uniform scale
 * - O(1) swap-with-last removal (no fragmentation)
 */
export default class InstancedSpheres {
  private scene: THREE.Scene;
  private mesh: THREE.InstancedMesh | null = null;
  private dummy = new THREE.Object3D();

  // Track which entity IDs are in which instance slots
  private entityIds: EntityId[] = [];
  private entityIndexMap: Map<EntityId, number> = new Map();

  // Store radius per entity for transform updates (uniform scale)
  private entityRadii: Map<EntityId, number> = new Map();

  // Current count of active spheres (also the next available slot)
  private activeCount = 0;

  // Maximum capacity (can't grow InstancedMesh after creation)
  private readonly maxCount: number;

  constructor(scene: THREE.Scene, maxCount: number = 1000) {
    this.scene = scene;
    this.maxCount = maxCount;

    this.createMesh();
  }

  private createMesh(): void {
    // Unit sphere (radius 0.5, diameter 1) - scale applied per-instance
    const geometry = new THREE.SphereGeometry(0.5, 16, 12);

    const material = new THREE.MeshStandardMaterial({
      color: 0x4169e1, // Royal blue - matches default sphere color
      roughness: 0.6,
      metalness: 0.2,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, this.maxCount);

    // Initialize all instances with zero scale (invisible)
    const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.maxCount; i++) {
      this.mesh.setMatrixAt(i, zeroMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // Disable frustum culling - instances are scattered across a large area by physics
    this.mesh.frustumCulled = false;

    // Use DynamicDrawUsage for frequently updated data
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.scene.add(this.mesh);
  }

  /**
   * Add a single sphere with specified radius
   */
  addSphere(entityId: EntityId, radius: number = 0.5): boolean {
    if (!this.mesh) return false;

    if (this.activeCount >= this.maxCount) {
      console.warn(
        `[InstancedSpheres] Cannot add sphere - at max capacity of ${this.maxCount}`,
      );
      return false;
    }

    const index = this.activeCount;

    this.entityIds[index] = entityId;
    this.entityIndexMap.set(entityId, index);
    // Radius stored as scale factor (geometry has radius 0.5, so scale = radius * 2)
    this.entityRadii.set(entityId, radius * 2);

    this.activeCount++;

    return true;
  }

  /**
   * Add multiple spheres in batch
   */
  addSpheres(entityIds: EntityId[], radii?: number[]): number {
    if (!this.mesh) return 0;

    const count = entityIds.length;
    const availableSlots = this.maxCount - this.activeCount;

    if (count > availableSlots) {
      console.warn(
        `[InstancedSpheres] Can only add ${availableSlots} spheres - would exceed max capacity of ${this.maxCount}`,
      );
      return 0;
    }

    const startIndex = this.activeCount;

    for (let i = 0; i < count; i++) {
      const id = entityIds[i];
      const index = startIndex + i;
      const radius = radii?.[i] ?? 0.5;

      this.entityIds[index] = id;
      this.entityIndexMap.set(id, index);
      this.entityRadii.set(id, radius * 2);
    }

    this.activeCount += count;

    return count;
  }

  /**
   * Remove a single sphere using swap-with-last strategy
   * O(1) removal without fragmentation
   */
  removeSphere(entityId: EntityId): boolean {
    if (!this.mesh) return false;

    const index = this.entityIndexMap.get(entityId);
    if (index === undefined) return false;

    const lastIndex = this.activeCount - 1;

    if (index !== lastIndex) {
      // Swap with last: move last entity to this slot
      const lastEntityId = this.entityIds[lastIndex];

      // Copy transform matrix from last to removed slot
      const matrix = new THREE.Matrix4();
      this.mesh.getMatrixAt(lastIndex, matrix);
      this.mesh.setMatrixAt(index, matrix);

      // Update tracking for swapped entity
      this.entityIds[index] = lastEntityId;
      this.entityIndexMap.set(lastEntityId, index);

      // Move radius data
      const lastRadius = this.entityRadii.get(lastEntityId);
      if (lastRadius !== undefined) {
        this.entityRadii.set(lastEntityId, lastRadius);
      }
    }

    // Hide the last slot (now empty)
    const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    this.mesh.setMatrixAt(lastIndex, zeroMatrix);

    // Clean up removed entity
    this.entityIndexMap.delete(entityId);
    this.entityRadii.delete(entityId);
    this.activeCount--;

    this.mesh.instanceMatrix.needsUpdate = true;

    return true;
  }

  /**
   * Remove multiple spheres in batch
   */
  removeSpheres(entityIds: EntityId[]): number {
    let removed = 0;
    for (const id of entityIds) {
      if (this.removeSphere(id)) {
        removed++;
      }
    }
    return removed;
  }

  /**
   * Update a single instance's transform
   */
  updateInstance(
    entityId: EntityId,
    position: THREE.Vector3,
    quaternion: THREE.Quaternion,
  ): void {
    if (!this.mesh) return;

    const index = this.entityIndexMap.get(entityId);
    if (index === undefined) return;

    // Get stored scale for this entity (radius * 2 for uniform scale)
    const scale = this.entityRadii.get(entityId) ?? 1;

    this.dummy.position.copy(position);
    this.dummy.quaternion.copy(quaternion);
    this.dummy.scale.set(scale, scale, scale);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this.dummy.matrix);
  }

  /**
   * Call after updating all instances to flush changes to GPU
   */
  commitUpdates(): void {
    if (!this.mesh) return;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Check if entity exists
   */
  hasEntity(entityId: EntityId): boolean {
    return this.entityIndexMap.has(entityId);
  }

  /**
   * Get the entity ID for a given instance index
   */
  getEntityId(index: number): EntityId | undefined {
    return this.entityIds[index];
  }

  /**
   * Get instance index for an entity ID
   */
  getInstanceIndex(entityId: EntityId): number | undefined {
    return this.entityIndexMap.get(entityId);
  }

  /**
   * Get all active entity IDs
   */
  getEntityIds(): EntityId[] {
    return this.entityIds.slice(0, this.activeCount);
  }

  /**
   * Get current active sphere count
   */
  getCount(): number {
    return this.activeCount;
  }

  /**
   * Clear all spheres
   */
  clear(): void {
    if (!this.mesh) return;

    const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.activeCount; i++) {
      this.mesh.setMatrixAt(i, zeroMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    this.entityIds = [];
    this.entityIndexMap.clear();
    this.entityRadii.clear();
    this.activeCount = 0;
  }

  dispose(): void {
    if (!this.mesh) return;

    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.scene.remove(this.mesh);
    this.mesh = null;

    this.entityIds = [];
    this.entityIndexMap.clear();
    this.entityRadii.clear();
    this.activeCount = 0;
  }
}
