import * as THREE from "three";
import type { EntityId } from "~/shared/types";
import type { RenderComponent, EntityContext } from "../types";

/**
 * Dynamic sphere configuration
 */
export interface DynamicSphereData {
  radius?: number;
  color?: number;
  widthSegments?: number;
  heightSegments?: number;
}

/**
 * DynamicSphereEntity - Physics-enabled sphere that syncs with physics worker
 *
 * Creates a sphere mesh whose transform is updated from the shared buffer.
 * Used for dynamic physics objects like balls, projectiles, etc.
 */
export class DynamicSphereEntity implements RenderComponent {
  readonly id: EntityId;
  readonly type = "dynamic-sphere";
  readonly object: THREE.Mesh;

  private geometry: THREE.BufferGeometry;
  private material: THREE.Material;

  constructor(
    id: EntityId,
    context: EntityContext,
    data: DynamicSphereData = {},
  ) {
    this.id = id;

    const radius = data.radius ?? 0.5;
    const color = data.color ?? 0x4169e1; // Default royal blue
    const widthSegments = data.widthSegments ?? 32;
    const heightSegments = data.heightSegments ?? 32;

    this.geometry = new THREE.SphereGeometry(
      radius,
      widthSegments,
      heightSegments,
    );
    this.material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.6,
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
 * Factory function for creating DynamicSphereEntity
 */
export function createDynamicSphereEntity(
  id: EntityId,
  context: EntityContext,
  data?: Record<string, unknown>,
): RenderComponent {
  return new DynamicSphereEntity(id, context, data as DynamicSphereData);
}
