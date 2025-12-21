/**
 * Entity spawn command types
 *
 * WebSocket-ready API - all commands can be serialized and sent over network
 */

import type { EntityId } from "~/shared/types";

/**
 * Command to spawn a box entity
 */
export interface SpawnBoxCommand {
  entityId?: EntityId; // Optional - auto-generate if not provided
  position: { x: number; y: number; z: number };
  size?: { x: number; y: number; z: number }; // Default 1x1x1
  color?: number; // Default brown (0x8b4513)
}

/**
 * Command to spawn a sphere entity
 */
export interface SpawnSphereCommand {
  entityId?: EntityId; // Optional - auto-generate if not provided
  position: { x: number; y: number; z: number };
  radius?: number; // Default 0.5
  color?: number; // Default blue (0x4169e1)
}

/**
 * Command to spawn the player entity
 */
export interface SpawnPlayerCommand {
  position: { x: number; y: number; z: number };
}

/**
 * Batch spawn result
 */
export interface BatchSpawnResult {
  entityIds: EntityId[];
  successCount: number;
}

/**
 * Default colors for entity types
 */
export const DEFAULT_COLORS = {
  box: 0x8b4513, // Brown
  sphere: 0x4169e1, // Royal blue
} as const;

/**
 * Default sizes for entity types
 */
export const DEFAULT_SIZES = {
  box: { x: 1, y: 1, z: 1 },
  sphereRadius: 0.5,
} as const;
