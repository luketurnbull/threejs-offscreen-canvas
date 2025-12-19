import * as THREE from "three";
import type Resources from "../systems/resources";
import { generateTerrainHeights } from "~/shared/utils";
import { config } from "~/shared/config";

export default class Floor {
  private scene: THREE.Scene;
  mesh: THREE.Mesh;
  repeatRate: number = 10;

  constructor(scene: THREE.Scene, resources: Resources) {
    this.scene = scene;

    const { size, segments } = config.terrain;

    // Create geometry with segments for vertex displacement
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

    // Generate heights using same config as physics (deterministic)
    const heights = generateTerrainHeights(config.terrain);

    // Displace vertices to match physics heightfield
    this.displaceVertices(geometry, heights, segments);

    // Recompute normals for correct lighting on slopes
    geometry.computeVertexNormals();

    const material = this.createMaterial(resources);

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.rotation.x = -Math.PI * 0.5;
    this.mesh.receiveShadow = true;

    this.scene.add(this.mesh);
  }

  /**
   * Displace geometry vertices based on height data
   *
   * Critical: Three.js PlaneGeometry uses row-major order (X varies fastest),
   * while Rapier heightfield uses column-major order (Z varies fastest).
   * This method handles the index conversion.
   */
  private displaceVertices(
    geometry: THREE.PlaneGeometry,
    heights: Float32Array,
    segments: number,
  ): void {
    const positions = geometry.attributes.position;
    const rows = segments + 1;
    const cols = segments + 1;

    // PlaneGeometry vertices are in row-major order
    for (let i = 0; i < positions.count; i++) {
      // Convert PlaneGeometry index to grid coords
      const gridX = i % cols;
      const gridZ = Math.floor(i / cols);

      // Convert to column-major index for heights array (matches Rapier)
      const heightIndex = gridX * rows + gridZ;
      const height = heights[heightIndex];

      // Z is the "up" direction in PlaneGeometry before rotation
      positions.setZ(i, height);
    }

    positions.needsUpdate = true;
  }

  createMaterial(resources: Resources) {
    const colorTexture = resources.items.grassColorTexture as THREE.Texture;
    colorTexture.colorSpace = THREE.SRGBColorSpace;
    colorTexture.repeat.set(this.repeatRate, this.repeatRate);
    colorTexture.wrapS = THREE.RepeatWrapping;
    colorTexture.wrapT = THREE.RepeatWrapping;

    const normalTexture = resources.items.grassNormalTexture as THREE.Texture;
    normalTexture.repeat.set(this.repeatRate, this.repeatRate);
    normalTexture.wrapS = THREE.RepeatWrapping;
    normalTexture.wrapT = THREE.RepeatWrapping;

    return new THREE.MeshStandardMaterial({
      map: colorTexture,
      normalMap: normalTexture,
    });
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.scene.remove(this.mesh);
  }
}
