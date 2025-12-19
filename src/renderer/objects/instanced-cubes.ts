import * as THREE from "three/webgpu";
import type { EntityId } from "~/shared/types";

/**
 * InstancedCubes - Efficiently renders many cubes using GPU instancing
 *
 * Uses THREE.InstancedMesh for single draw call rendering of hundreds of cubes.
 * Each cube's transform is synced from the physics worker via SharedArrayBuffer.
 */
export default class InstancedCubes {
  private scene: THREE.Scene;
  private mesh: THREE.InstancedMesh | null = null;
  private dummy = new THREE.Object3D();

  // Track which entity IDs are in which instance slots
  private entityIds: EntityId[] = [];
  private entityIndexMap: Map<EntityId, number> = new Map();

  // Current count of active cubes
  private activeCount = 0;

  // Maximum capacity (can't grow InstancedMesh after creation)
  private readonly maxCount: number;

  // Cube size
  private readonly size: number;

  constructor(scene: THREE.Scene, maxCount: number = 1000, size: number = 0.5) {
    this.scene = scene;
    this.maxCount = maxCount;
    this.size = size;

    this.createMesh();
  }

  private createMesh(): void {
    const geometry = new THREE.BoxGeometry(this.size, this.size, this.size);
    const material = new THREE.MeshStandardMaterial({
      roughness: 0.7,
      metalness: 0.1,
    });

    this.mesh = new THREE.InstancedMesh(geometry, material, this.maxCount);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;

    // Important: Use DynamicDrawUsage for frequently updated transforms
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Initialize all instances as invisible (scale 0)
    const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.maxCount; i++) {
      this.mesh.setMatrixAt(i, zeroMatrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // Initialize instance colors
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(this.maxCount * 3),
      3,
    );

    this.scene.add(this.mesh);
  }

  /**
   * Add cubes with entity IDs
   * Returns the starting index of the added cubes
   */
  addCubes(entityIds: EntityId[]): number {
    if (!this.mesh) return -1;

    const startIndex = this.activeCount;
    const count = entityIds.length;

    if (startIndex + count > this.maxCount) {
      console.warn(
        `[InstancedCubes] Cannot add ${count} cubes - would exceed max capacity of ${this.maxCount}`,
      );
      return -1;
    }

    for (let i = 0; i < count; i++) {
      const id = entityIds[i];
      const index = startIndex + i;

      this.entityIds[index] = id;
      this.entityIndexMap.set(id, index);

      // Set random color for this cube
      const color = new THREE.Color().setHSL(Math.random(), 0.6, 0.5);
      this.mesh.setColorAt(index, color);
    }

    this.activeCount += count;

    // Update instance color buffer
    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }

    return startIndex;
  }

  /**
   * Remove cubes by entity IDs
   * Note: This doesn't compact the buffer, just hides the cubes
   */
  removeCubes(entityIds: EntityId[]): void {
    if (!this.mesh) return;

    const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    for (const id of entityIds) {
      const index = this.entityIndexMap.get(id);
      if (index !== undefined) {
        // Hide the cube by scaling to 0
        this.mesh.setMatrixAt(index, zeroMatrix);
        this.entityIndexMap.delete(id);
      }
    }

    this.mesh.instanceMatrix.needsUpdate = true;
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

    this.dummy.position.copy(position);
    this.dummy.quaternion.copy(quaternion);
    this.dummy.scale.set(1, 1, 1);
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
    return Array.from(this.entityIndexMap.keys());
  }

  /**
   * Get current active cube count
   */
  getCount(): number {
    return this.entityIndexMap.size;
  }

  /**
   * Clear all cubes
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
    this.activeCount = 0;
  }
}
