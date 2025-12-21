import * as THREE from "three/webgpu";
import type { EntityId } from "~/shared/types";

/**
 * InstancedBoxes - Efficiently renders many boxes using GPU instancing
 *
 * Uses THREE.InstancedMesh for single draw call rendering of hundreds of boxes.
 * Each box's transform is synced from the physics worker via SharedArrayBuffer.
 *
 * Features:
 * - Per-instance scale for different box sizes
 * - O(1) swap-with-last removal (no fragmentation)
 */
export default class InstancedBoxes {
  private scene: THREE.Scene;
  private mesh: THREE.InstancedMesh | null = null;
  private dummy = new THREE.Object3D();

  // Track which entity IDs are in which instance slots
  private entityIds: EntityId[] = [];
  private entityIndexMap: Map<EntityId, number> = new Map();

  // Store scales per entity for transform updates
  private entityScales: Map<EntityId, THREE.Vector3> = new Map();

  // Current count of active boxes (also the next available slot)
  private activeCount = 0;

  // Maximum capacity (can't grow InstancedMesh after creation)
  private readonly maxCount: number;

  constructor(scene: THREE.Scene, maxCount: number = 1000) {
    this.scene = scene;
    this.maxCount = maxCount;

    this.createMesh();
  }

  private createMesh(): void {
    // Unit box - scale applied per-instance via transform matrix
    const geometry = new THREE.BoxGeometry(1, 1, 1);

    const material = new THREE.MeshStandardNodeMaterial({
      color: 0x8b4513, // Brown - matches default box color
      roughness: 0.7,
      metalness: 0.1,
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

    // Disable frustum culling - instances are scattered across a large area by physics,
    // but the base geometry's bounding sphere is tiny.
    this.mesh.frustumCulled = false;

    // Use DynamicDrawUsage for frequently updated data
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.scene.add(this.mesh);
  }

  /**
   * Add a single box with specified scale
   */
  addBox(
    entityId: EntityId,
    scale: { x: number; y: number; z: number } = { x: 1, y: 1, z: 1 },
  ): boolean {
    if (!this.mesh) return false;

    if (this.activeCount >= this.maxCount) {
      console.warn(
        `[InstancedBoxes] Cannot add box - at max capacity of ${this.maxCount}`,
      );
      return false;
    }

    const index = this.activeCount;

    this.entityIds[index] = entityId;
    this.entityIndexMap.set(entityId, index);
    this.entityScales.set(
      entityId,
      new THREE.Vector3(scale.x, scale.y, scale.z),
    );

    this.activeCount++;

    return true;
  }

  /**
   * Add multiple boxes in batch
   */
  addBoxes(
    entityIds: EntityId[],
    scales?: Array<{ x: number; y: number; z: number }>,
  ): number {
    if (!this.mesh) return 0;

    const count = entityIds.length;
    const availableSlots = this.maxCount - this.activeCount;

    if (count > availableSlots) {
      console.warn(
        `[InstancedBoxes] Can only add ${availableSlots} boxes - would exceed max capacity of ${this.maxCount}`,
      );
      return 0;
    }

    const startIndex = this.activeCount;

    for (let i = 0; i < count; i++) {
      const id = entityIds[i];
      const index = startIndex + i;
      const scale = scales?.[i] ?? { x: 1, y: 1, z: 1 };

      this.entityIds[index] = id;
      this.entityIndexMap.set(id, index);
      this.entityScales.set(id, new THREE.Vector3(scale.x, scale.y, scale.z));
    }

    this.activeCount += count;

    return count;
  }

  /**
   * Remove a single box using swap-with-last strategy
   * O(1) removal without fragmentation
   */
  removeBox(entityId: EntityId): boolean {
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

      // Move scale data
      const lastScale = this.entityScales.get(lastEntityId);
      if (lastScale) {
        this.entityScales.set(lastEntityId, lastScale);
      }
    }

    // Hide the last slot (now empty)
    const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    this.mesh.setMatrixAt(lastIndex, zeroMatrix);

    // Clean up removed entity
    this.entityIndexMap.delete(entityId);
    this.entityScales.delete(entityId);
    this.activeCount--;

    this.mesh.instanceMatrix.needsUpdate = true;

    return true;
  }

  /**
   * Remove multiple boxes in batch
   */
  removeBoxes(entityIds: EntityId[]): number {
    let removed = 0;
    for (const id of entityIds) {
      if (this.removeBox(id)) {
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

    // Get stored scale for this entity
    const scale = this.entityScales.get(entityId) ?? new THREE.Vector3(1, 1, 1);

    this.dummy.position.copy(position);
    this.dummy.quaternion.copy(quaternion);
    this.dummy.scale.copy(scale);
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
   * Get current active box count
   */
  getCount(): number {
    return this.activeCount;
  }

  /**
   * Clear all boxes
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
    this.entityScales.clear();
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
    this.entityScales.clear();
    this.activeCount = 0;
  }
}
