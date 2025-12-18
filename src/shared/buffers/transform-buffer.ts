import type { EntityId } from "../types/entity";

/**
 * Layout per entity in Float32Array:
 * [posX, posY, posZ, rotX, rotY, rotZ, rotW] = 7 floats
 *
 * Plus a control Int32Array for synchronization:
 * [frameCounter, entityCount, ...entityIds]
 */

const FLOATS_PER_ENTITY = 7; // position (3) + quaternion (4)
const CONTROL_HEADER_SIZE = 2; // frameCounter, entityCount
const MAX_ENTITIES = 64;

// Control buffer layout
const FRAME_COUNTER_INDEX = 0;
const ENTITY_COUNT_INDEX = 1;
const ENTITY_IDS_START = 2;

/**
 * SharedTransformBuffer - Zero-copy transform synchronization between workers
 *
 * Uses SharedArrayBuffer for direct memory sharing between Physics and Render workers.
 * Physics worker writes transforms, Render worker reads them.
 *
 * Structure:
 * - controlBuffer (Int32Array): frame counter + entity IDs for synchronization
 * - transformBuffer (Float32Array): position + rotation data per entity
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Atomics
 */
export class SharedTransformBuffer {
  private controlSAB: SharedArrayBuffer;
  private transformSAB: SharedArrayBuffer;

  private controlView: Int32Array;
  private transformView: Float32Array;

  private entityIndexMap: Map<EntityId, number> = new Map();

  constructor(existingControl?: SharedArrayBuffer, existingTransform?: SharedArrayBuffer) {
    if (existingControl && existingTransform) {
      // Use existing buffers (when receiving in worker)
      this.controlSAB = existingControl;
      this.transformSAB = existingTransform;
    } else {
      // Create new buffers (in main thread)
      const controlSize = (CONTROL_HEADER_SIZE + MAX_ENTITIES) * Int32Array.BYTES_PER_ELEMENT;
      const transformSize = MAX_ENTITIES * FLOATS_PER_ENTITY * Float32Array.BYTES_PER_ELEMENT;

      this.controlSAB = new SharedArrayBuffer(controlSize);
      this.transformSAB = new SharedArrayBuffer(transformSize);
    }

    this.controlView = new Int32Array(this.controlSAB);
    this.transformView = new Float32Array(this.transformSAB);
  }

  /**
   * Get the underlying SharedArrayBuffers for transfer to workers
   */
  getBuffers(): { control: SharedArrayBuffer; transform: SharedArrayBuffer } {
    return {
      control: this.controlSAB,
      transform: this.transformSAB,
    };
  }

  /**
   * Register an entity and get its slot index
   * Called when spawning entities
   */
  registerEntity(id: EntityId): number {
    const currentCount = Atomics.load(this.controlView, ENTITY_COUNT_INDEX);

    if (currentCount >= MAX_ENTITIES) {
      console.error("[SharedTransformBuffer] Max entities exceeded");
      return -1;
    }

    const index = currentCount;
    this.entityIndexMap.set(id, index);

    // Store entity ID in control buffer
    Atomics.store(this.controlView, ENTITY_IDS_START + index, id as number);

    // Increment entity count
    Atomics.store(this.controlView, ENTITY_COUNT_INDEX, currentCount + 1);

    return index;
  }

  /**
   * Unregister an entity
   * Note: This doesn't compact the buffer, just marks the slot as unused
   */
  unregisterEntity(id: EntityId): void {
    this.entityIndexMap.delete(id);
  }

  /**
   * Get entity index from ID
   */
  getEntityIndex(id: EntityId): number {
    return this.entityIndexMap.get(id) ?? -1;
  }

  /**
   * Rebuild entity index map from control buffer
   * Called in workers after receiving buffers
   */
  rebuildEntityMap(): void {
    const count = Atomics.load(this.controlView, ENTITY_COUNT_INDEX);

    for (let i = 0; i < count; i++) {
      const entityId = Atomics.load(this.controlView, ENTITY_IDS_START + i) as EntityId;
      this.entityIndexMap.set(entityId, i);
    }
  }

  // ============================================
  // Physics Worker: Write transforms
  // ============================================

  /**
   * Write transform data for an entity
   * Called by Physics Worker each physics step
   */
  writeTransform(
    entityIndex: number,
    posX: number,
    posY: number,
    posZ: number,
    rotX: number,
    rotY: number,
    rotZ: number,
    rotW: number,
  ): void {
    const offset = entityIndex * FLOATS_PER_ENTITY;

    // Write transform data (non-atomic is fine for floats, we use frame counter for sync)
    this.transformView[offset + 0] = posX;
    this.transformView[offset + 1] = posY;
    this.transformView[offset + 2] = posZ;
    this.transformView[offset + 3] = rotX;
    this.transformView[offset + 4] = rotY;
    this.transformView[offset + 5] = rotZ;
    this.transformView[offset + 6] = rotW;
  }

  /**
   * Increment frame counter after all transforms are written
   * This signals to the Render Worker that new data is available
   */
  signalFrameComplete(): void {
    Atomics.add(this.controlView, FRAME_COUNTER_INDEX, 1);
  }

  /**
   * Get current frame counter
   */
  getFrameCounter(): number {
    return Atomics.load(this.controlView, FRAME_COUNTER_INDEX);
  }

  // ============================================
  // Render Worker: Read transforms
  // ============================================

  /**
   * Read transform data for an entity
   * Called by Render Worker each render frame
   */
  readTransform(entityIndex: number): {
    posX: number;
    posY: number;
    posZ: number;
    rotX: number;
    rotY: number;
    rotZ: number;
    rotW: number;
  } {
    const offset = entityIndex * FLOATS_PER_ENTITY;

    return {
      posX: this.transformView[offset + 0],
      posY: this.transformView[offset + 1],
      posZ: this.transformView[offset + 2],
      rotX: this.transformView[offset + 3],
      rotY: this.transformView[offset + 4],
      rotZ: this.transformView[offset + 5],
      rotW: this.transformView[offset + 6],
    };
  }

  /**
   * Get entity count
   */
  getEntityCount(): number {
    return Atomics.load(this.controlView, ENTITY_COUNT_INDEX);
  }

  /**
   * Get entity ID at index
   */
  getEntityIdAt(index: number): EntityId {
    return Atomics.load(this.controlView, ENTITY_IDS_START + index) as EntityId;
  }
}

/**
 * Check if SharedArrayBuffer is supported
 */
export function isSharedArrayBufferSupported(): boolean {
  return typeof SharedArrayBuffer !== "undefined" && crossOriginIsolated;
}
