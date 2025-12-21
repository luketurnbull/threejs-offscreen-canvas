/**
 * EntityCoordinator - Orchestrates all entity spawners
 *
 * Central hub for entity management. WebSocket-ready API
 * for future networked entity sync.
 */

import * as Comlink from "comlink";
import type { PhysicsApi } from "~/shared/types/physics-api";
import type { RenderApi } from "~/shared/types/render-api";
import type { SharedTransformBuffer } from "~/shared/buffers/transform-buffer";
import type { EntityId } from "~/shared/types";
import {
  BoxSpawner,
  SphereSpawner,
  PlayerSpawner,
  WorldSpawner,
} from "./spawners";
import type { SpawnBoxCommand, SpawnSphereCommand } from "./types";

export default class EntityCoordinator {
  private worldSpawner: WorldSpawner;
  private playerSpawner: PlayerSpawner;
  private boxSpawner: BoxSpawner;
  private sphereSpawner: SphereSpawner;

  constructor(
    physicsApi: Comlink.Remote<PhysicsApi>,
    renderApi: Comlink.Remote<RenderApi>,
    sharedBuffer: SharedTransformBuffer,
  ) {
    this.worldSpawner = new WorldSpawner(physicsApi, renderApi, sharedBuffer);
    this.playerSpawner = new PlayerSpawner(physicsApi, renderApi, sharedBuffer);
    this.boxSpawner = new BoxSpawner(physicsApi, renderApi, sharedBuffer);
    this.sphereSpawner = new SphereSpawner(physicsApi, renderApi, sharedBuffer);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // World Setup
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Initialize the world (ground, player, initial objects)
   */
  async initWorld(): Promise<void> {
    // Spawn ground
    await this.worldSpawner.spawnGround();

    // Spawn player
    await this.playerSpawner.spawn({ position: { x: 0, y: 5, z: 0 } });

    // Spawn initial test objects
    await this.spawnInitialObjects();
  }

  /**
   * Spawn initial test objects (boxes and spheres)
   */
  private async spawnInitialObjects(): Promise<void> {
    // Spawn dynamic boxes
    await this.boxSpawner.spawnBatch([
      { position: { x: 3, y: 6, z: 0 } },
      { position: { x: 3, y: 8, z: 0 } },
      { position: { x: 3, y: 10, z: 0 } },
    ]);

    // Spawn dynamic spheres
    await this.sphereSpawner.spawnBatch([
      { position: { x: -3, y: 7, z: 0 }, radius: 0.5 },
      { position: { x: -3, y: 9, z: 1 }, radius: 0.4 },
      { position: { x: -3, y: 8, z: -1 }, radius: 0.6 },
    ]);
  }

  /**
   * Spawn test objects for debugging
   */
  async spawnTestObjects(boxCount: number, sphereCount: number): Promise<void> {
    const boxCommands: SpawnBoxCommand[] = [];
    const sphereCommands: SpawnSphereCommand[] = [];

    // Generate random box positions
    for (let i = 0; i < boxCount; i++) {
      boxCommands.push({
        position: {
          x: (Math.random() - 0.5) * 20,
          y: 5 + Math.random() * 10,
          z: (Math.random() - 0.5) * 20,
        },
      });
    }

    // Generate random sphere positions
    for (let i = 0; i < sphereCount; i++) {
      sphereCommands.push({
        position: {
          x: (Math.random() - 0.5) * 20,
          y: 5 + Math.random() * 10,
          z: (Math.random() - 0.5) * 20,
        },
      });
    }

    await Promise.all([
      this.boxSpawner.spawnBatch(boxCommands),
      this.sphereSpawner.spawnBatch(sphereCommands),
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Box Spawning (WebSocket-ready API)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Spawn a single box
   */
  async spawnBox(command: SpawnBoxCommand): Promise<EntityId> {
    return this.boxSpawner.spawn(command);
  }

  /**
   * Spawn multiple boxes in batch
   */
  async spawnBoxes(commands: SpawnBoxCommand[]): Promise<EntityId[]> {
    return this.boxSpawner.spawnBatch(commands);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sphere Spawning (WebSocket-ready API)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Spawn a single sphere
   */
  async spawnSphere(command: SpawnSphereCommand): Promise<EntityId> {
    return this.sphereSpawner.spawn(command);
  }

  /**
   * Spawn multiple spheres in batch
   */
  async spawnSpheres(commands: SpawnSphereCommand[]): Promise<EntityId[]> {
    return this.sphereSpawner.spawnBatch(commands);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Entity Removal
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Remove a box entity by ID
   */
  async removeBox(entityId: EntityId): Promise<void> {
    return this.boxSpawner.remove(entityId);
  }

  /**
   * Remove a sphere entity by ID
   */
  async removeSphere(entityId: EntityId): Promise<void> {
    return this.sphereSpawner.remove(entityId);
  }

  /**
   * Remove multiple entities (auto-detects type)
   */
  async removeEntities(entityIds: EntityId[]): Promise<void> {
    // Filter by type
    const boxIds = entityIds.filter((id) =>
      this.boxSpawner.getEntityIds().includes(id),
    );
    const sphereIds = entityIds.filter((id) =>
      this.sphereSpawner.getEntityIds().includes(id),
    );

    await Promise.all([
      this.boxSpawner.removeBatch(boxIds),
      this.sphereSpawner.removeBatch(sphereIds),
    ]);
  }

  /**
   * Clear all boxes
   */
  async clearBoxes(): Promise<void> {
    return this.boxSpawner.clear();
  }

  /**
   * Clear all spheres
   */
  async clearSpheres(): Promise<void> {
    return this.sphereSpawner.clear();
  }

  /**
   * Clear all dynamic entities (boxes + spheres)
   */
  async clearAll(): Promise<void> {
    await Promise.all([this.boxSpawner.clear(), this.sphereSpawner.clear()]);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Counts & Queries
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get box count
   */
  getBoxCount(): number {
    return this.boxSpawner.getCount();
  }

  /**
   * Get sphere count
   */
  getSphereCount(): number {
    return this.sphereSpawner.getCount();
  }

  /**
   * Get total dynamic entity count
   */
  getTotalCount(): number {
    return this.boxSpawner.getCount() + this.sphereSpawner.getCount();
  }

  /**
   * Get player entity ID
   */
  getPlayerId(): EntityId | null {
    return this.playerSpawner.getPlayerId();
  }

  /**
   * Get ground entity ID
   */
  getGroundId(): EntityId | null {
    return this.worldSpawner.getGroundId();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Dispose all spawners and resources
   */
  dispose(): void {
    this.boxSpawner.dispose();
    this.sphereSpawner.dispose();
    this.playerSpawner.dispose();
    this.worldSpawner.dispose();
  }
}

// Re-export types
export * from "./types";
