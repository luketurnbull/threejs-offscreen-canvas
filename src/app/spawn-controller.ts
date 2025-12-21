/**
 * SpawnController - Orchestrates click-to-spawn mechanics
 *
 * Handles:
 * - Receiving canvas click events with normalized coordinates
 * - Raycasting to find spawn direction
 * - Calculating spawn position and velocity
 * - Spawning entities via EntityCoordinator
 */

import type { Remote } from "comlink";
import type { RenderApi, SerializedClickEvent } from "~/shared/types";
import type { EntitySpawnerUI } from "./components/entity-spawner-ui";
import type EntityCoordinator from "./entities";

// Spawn configuration
const SPAWN_OFFSET = 2; // meters in front of camera
const PROJECTILE_SPEED = 20; // m/s

export default class SpawnController {
  private ui: EntitySpawnerUI;
  private entities: EntityCoordinator;
  private renderApi: Remote<RenderApi>;

  constructor(
    ui: EntitySpawnerUI,
    entities: EntityCoordinator,
    renderApi: Remote<RenderApi>,
  ) {
    this.ui = ui;
    this.entities = entities;
    this.renderApi = renderApi;
  }

  /**
   * Handle a canvas click event
   * Performs raycast and spawns entity shooting from camera
   */
  async handleClick(event: SerializedClickEvent): Promise<void> {
    // 1. Get spawn config from UI
    const config = this.ui.getSpawnConfig();

    // 2. Raycast to get spawn position and direction
    const raycast = await this.renderApi.raycastGround(event.x, event.y);
    if (!raycast) {
      // No hit on ground plane (e.g., pointing at sky)
      return;
    }

    // 3. Calculate spawn position (near camera) and velocity (toward hit point)
    const spawnPos = {
      x: raycast.origin.x + raycast.direction.x * SPAWN_OFFSET,
      y: raycast.origin.y + raycast.direction.y * SPAWN_OFFSET,
      z: raycast.origin.z + raycast.direction.z * SPAWN_OFFSET,
    };

    const velocity = {
      x: raycast.direction.x * PROJECTILE_SPEED,
      y: raycast.direction.y * PROJECTILE_SPEED,
      z: raycast.direction.z * PROJECTILE_SPEED,
    };

    // 4. Spawn entity with velocity
    if (config.shape === "box") {
      await this.entities.spawnBox({
        position: spawnPos,
        size: { x: config.size, y: config.size, z: config.size },
        color: config.color,
        velocity,
      });
    } else {
      await this.entities.spawnSphere({
        position: spawnPos,
        radius: config.size,
        color: config.color,
        velocity,
      });
    }
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    // Nothing to dispose currently
  }
}
