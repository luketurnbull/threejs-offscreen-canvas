import RAPIER from "@dimforge/rapier3d-compat";
import type {
  EntityId,
  Transform,
  CharacterControllerConfig,
  MovementInput,
} from "~/shared/types";
import { config } from "~/shared/config";

/**
 * CharacterController - Handles player movement physics
 *
 * Manages a kinematic rigid body with Rapier's character controller
 * for smooth movement, collision detection, and slope handling.
 */
export default class CharacterController {
  private controller: RAPIER.KinematicCharacterController;
  private body: RAPIER.RigidBody;
  private collider: RAPIER.Collider;
  private entityId: EntityId;

  private input: MovementInput = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
  };
  private rotationY = 0;

  // Movement settings from config
  private readonly moveSpeed = config.player.moveSpeed;
  private readonly sprintMultiplier = config.player.sprintMultiplier;
  private readonly turnSpeed = config.player.turnSpeed;
  private readonly gravity = config.physics.gravity.y;

  constructor(
    world: RAPIER.World,
    id: EntityId,
    transform: Transform,
    controllerConfig: CharacterControllerConfig,
  ) {
    this.entityId = id;

    // Create kinematic rigid body for player
    // Body position represents the feet/bottom of the character
    const bodyDesc =
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        transform.position.x,
        transform.position.y,
        transform.position.z,
      );

    this.body = world.createRigidBody(bodyDesc);

    // Create cuboid collider for player (better for quadruped fox)
    const colliderDesc = RAPIER.ColliderDesc.cuboid(
      controllerConfig.halfWidth,
      controllerConfig.halfHeight,
      controllerConfig.halfLength,
    );

    // Offset collider so body position = feet position (bottom of collider)
    // This way when body.y = 0, the character's feet are at ground level
    colliderDesc.setTranslation(0, controllerConfig.halfHeight, 0);

    this.collider = world.createCollider(colliderDesc, this.body);

    // Create character controller
    this.controller = world.createCharacterController(0.01);
    this.controller.enableAutostep(
      controllerConfig.stepHeight,
      controllerConfig.stepHeight,
      true,
    );
    this.controller.enableSnapToGround(0.5);
    this.controller.setMaxSlopeClimbAngle(
      (controllerConfig.maxSlopeAngle * Math.PI) / 180,
    );
    this.controller.setMinSlopeSlideAngle(
      (controllerConfig.minSlopeSlideAngle * Math.PI) / 180,
    );

    // Initialize rotation from transform
    this.rotationY = this.quaternionToYRotation(transform.rotation);
  }

  /**
   * Set current input state
   */
  setInput(input: MovementInput): void {
    this.input = input;
  }

  /**
   * Update player movement based on input
   * Should be called each physics step
   */
  update(deltaSeconds: number): void {
    // Handle rotation (A/D)
    if (this.input.left) {
      this.rotationY += this.turnSpeed * deltaSeconds;
    }
    if (this.input.right) {
      this.rotationY -= this.turnSpeed * deltaSeconds;
    }

    // Calculate movement direction
    let moveX = 0;
    let moveZ = 0;

    if (this.input.forward) {
      moveX += Math.sin(this.rotationY);
      moveZ += Math.cos(this.rotationY);
    }
    if (this.input.backward) {
      moveX -= Math.sin(this.rotationY);
      moveZ -= Math.cos(this.rotationY);
    }

    // Apply speed
    const speed = this.input.sprint
      ? this.moveSpeed * this.sprintMultiplier
      : this.moveSpeed;

    // Compute desired movement
    const desiredMovement = {
      x: moveX * speed * deltaSeconds,
      y: this.gravity * deltaSeconds,
      z: moveZ * speed * deltaSeconds,
    };

    // Use character controller to compute actual movement with collision
    this.controller.computeColliderMovement(
      this.collider,
      desiredMovement,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    );

    const correctedMovement = this.controller.computedMovement();
    const currentPos = this.body.translation();

    // Apply movement to kinematic body
    this.body.setNextKinematicTranslation({
      x: currentPos.x + correctedMovement.x,
      y: currentPos.y + correctedMovement.y,
      z: currentPos.z + correctedMovement.z,
    });

    // Apply rotation
    this.body.setNextKinematicRotation(
      this.yRotationToQuaternion(this.rotationY),
    );
  }

  /**
   * Get the rigid body
   */
  getBody(): RAPIER.RigidBody {
    return this.body;
  }

  /**
   * Get the collider
   */
  getCollider(): RAPIER.Collider {
    return this.collider;
  }

  /**
   * Get the entity ID
   */
  getEntityId(): EntityId {
    return this.entityId;
  }

  /**
   * Convert quaternion to Y-axis rotation (yaw)
   */
  private quaternionToYRotation(q: {
    x: number;
    y: number;
    z: number;
    w: number;
  }): number {
    const siny_cosp = 2 * (q.w * q.y + q.z * q.x);
    const cosy_cosp = 1 - 2 * (q.x * q.x + q.y * q.y);
    return Math.atan2(siny_cosp, cosy_cosp);
  }

  /**
   * Convert Y-axis rotation to quaternion
   */
  private yRotationToQuaternion(yRotation: number): {
    x: number;
    y: number;
    z: number;
    w: number;
  } {
    const halfAngle = yRotation / 2;
    return {
      x: 0,
      y: Math.sin(halfAngle),
      z: 0,
      w: Math.cos(halfAngle),
    };
  }
}
