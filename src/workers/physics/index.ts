import * as Comlink from "comlink";
import type {
  PhysicsApi,
  EntityId,
  Transform,
  PhysicsBodyConfig,
  CharacterControllerConfig,
  MovementInput,
  TransformUpdateBatch,
  EntitySpawnData,
} from "~/shared/types";
import PhysicsWorld from "./physics-world";

/**
 * Physics Worker Entry Point
 *
 * Exposes PhysicsApi via Comlink for communication with main thread.
 * Manages Rapier physics simulation and sends transform updates.
 */

let physicsWorld: PhysicsWorld | null = null;

const api: PhysicsApi = {
  async init(
    gravity: { x: number; y: number; z: number } = { x: 0, y: -9.81, z: 0 },
  ): Promise<void> {
    physicsWorld = new PhysicsWorld();
    await physicsWorld.init(gravity);
  },

  async spawnEntity(
    entity: EntitySpawnData,
    bodyConfig: PhysicsBodyConfig,
  ): Promise<void> {
    if (!physicsWorld) {
      throw new Error("Physics world not initialized");
    }
    physicsWorld.spawnEntity(entity.id, entity.transform, bodyConfig);
  },

  async spawnPlayer(
    id: EntityId,
    transform: Transform,
    config: CharacterControllerConfig,
  ): Promise<void> {
    if (!physicsWorld) {
      throw new Error("Physics world not initialized");
    }
    physicsWorld.spawnPlayer(id, transform, config);
  },

  removeEntity(id: EntityId): void {
    physicsWorld?.removeEntity(id);
  },

  setPlayerInput(input: MovementInput): void {
    physicsWorld?.setPlayerInput(input);
  },

  start(onUpdate: (updates: TransformUpdateBatch) => void): void {
    if (!physicsWorld) {
      throw new Error("Physics world not initialized");
    }
    physicsWorld.start(onUpdate);
  },

  pause(): void {
    physicsWorld?.pause();
  },

  resume(): void {
    physicsWorld?.resume();
  },

  dispose(): void {
    physicsWorld?.dispose();
    physicsWorld = null;
  },
};

Comlink.expose(api);

export type { PhysicsApi };
