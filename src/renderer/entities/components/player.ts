import * as THREE from "three";
import type { EntityId } from "~/shared/types";
import type { RenderComponent, EntityContext } from "../types";
import type InputState from "../../systems/input-state";
import Fox from "../../objects/fox";

/**
 * PlayerEntity - Player character with Fox model and animations
 *
 * Wraps Fox class with entity lifecycle hooks.
 * Handles animation state transitions based on input.
 */
export class PlayerEntity implements RenderComponent {
  readonly id: EntityId;
  readonly type = "player";
  readonly object: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;

  private fox: Fox;

  constructor(id: EntityId, context: EntityContext) {
    this.id = id;
    this.fox = new Fox(context.scene, context.resources);
    this.object = this.fox.model;
    this.mixer = this.fox.mixer;
  }

  /**
   * Update animation state based on input when new physics frame arrives
   */
  onPhysicsFrame(inputState: InputState): void {
    const isForward = inputState.isKeyDown("w");
    const isBackward = inputState.isKeyDown("s");
    const isTurnLeft = inputState.isKeyDown("a");
    const isTurnRight = inputState.isKeyDown("d");
    const isRunning = inputState.isKeyDown("shift");

    const isMoving = isForward || isBackward;
    const isTurning = isTurnLeft || isTurnRight;

    if (isMoving) {
      const targetAnimation = isRunning ? "running" : "walking";
      if (this.fox.actions.current !== this.fox.actions[targetAnimation]) {
        this.fox.play(targetAnimation);
      }
    } else if (isTurning) {
      if (this.fox.actions.current !== this.fox.actions.walking) {
        this.fox.play("walking");
      }
    } else {
      if (this.fox.actions.current !== this.fox.actions.idle) {
        this.fox.play("idle");
      }
    }
  }

  dispose(): void {
    this.fox.dispose();
  }
}

/**
 * Factory function for creating PlayerEntity
 */
export function createPlayerEntity(
  id: EntityId,
  context: EntityContext,
): RenderComponent {
  return new PlayerEntity(id, context);
}
