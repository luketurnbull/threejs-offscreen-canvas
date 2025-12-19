import * as THREE from "three";
import type { EntityId } from "~/shared/types";
import type { RenderComponent, EntityContext } from "../types";

/**
 * Dynamic box configuration
 */
export interface DynamicBoxData {
  size?: { x: number; y: number; z: number };
  color?: number;
}

/**
 * DynamicBoxEntity - Physics-enabled box that syncs with physics worker
 *
 * Creates a box mesh whose transform is updated from the shared buffer.
 * Used for dynamic physics objects like crates, debris, etc.
 */
export class DynamicBoxEntity implements RenderComponent {
  readonly id: EntityId;
  readonly type = "dynamic-box";
  readonly object: THREE.Mesh;

  private geometry: THREE.BufferGeometry;
  private material: THREE.Material;

  constructor(id: EntityId, context: EntityContext, data: DynamicBoxData = {}) {
    this.id = id;

    const size = data.size ?? { x: 1, y: 1, z: 1 };
    const color = data.color ?? 0x8b4513; // Default brown (wood crate color)

    this.geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    this.material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.8,
      metalness: 0.1,
    });

    this.object = new THREE.Mesh(this.geometry, this.material);
    this.object.castShadow = true;
    this.object.receiveShadow = true;

    context.scene.add(this.object);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.object.parent?.remove(this.object);
  }
}

/**
 * Factory function for creating DynamicBoxEntity
 */
export function createDynamicBoxEntity(
  id: EntityId,
  context: EntityContext,
  data?: Record<string, unknown>,
): RenderComponent {
  return new DynamicBoxEntity(id, context, data as DynamicBoxData);
}
