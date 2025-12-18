import * as Comlink from "comlink";
import type {
  PhysicsApi,
  EntityId,
  Transform,
  PhysicsBodyConfig,
  CharacterControllerConfig,
  MovementInput,
  EntitySpawnData,
  SharedBuffers,
} from "~/shared/types";
import { SharedTransformBuffer } from "~/shared/buffers";
import PhysicsWorld from "./physics-world";

/**
 * Physics Worker Entry Point
 *
 * Exposes PhysicsApi via Comlink for communication with main thread.
 * Manages Rapier physics simulation and writes transforms to SharedArrayBuffer.
 */

let physicsWorld: PhysicsWorld | null = null;
let sharedBuffer: SharedTransformBuffer | null = null;

const api: PhysicsApi = {
  async init(
    gravity: { x: number; y: number; z: number },
    sharedBuffers: SharedBuffers,
  ): Promise<void> {
    sharedBuffer = new SharedTransformBuffer(
      sharedBuffers.control,
      sharedBuffers.transform,
    );

    physicsWorld = new PhysicsWorld();
    await physicsWorld.init(gravity, sharedBuffer);
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

  start(): void {
    if (!physicsWorld) {
      throw new Error("Physics world not initialized");
    }
    physicsWorld.start();
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
