import * as THREE from "three";

export interface FollowCameraOptions {
  distance?: number;
  height?: number;
  lookAtHeight?: number;
  damping?: number;
}

/**
 * FollowCamera - Third-person camera that follows a target from behind
 */
export default class FollowCamera {
  camera: THREE.PerspectiveCamera;
  target: THREE.Object3D | null = null;

  // Camera positioning
  distance: number;
  height: number;
  lookAtHeight: number;
  damping: number;

  // Internal state
  private currentPosition: THREE.Vector3 = new THREE.Vector3();
  private currentLookAt: THREE.Vector3 = new THREE.Vector3();

  // Reusable vectors
  private idealOffset: THREE.Vector3 = new THREE.Vector3();
  private idealLookAt: THREE.Vector3 = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    options: FollowCameraOptions = {},
  ) {
    this.camera = camera;
    this.distance = options.distance ?? 8;
    this.height = options.height ?? 4;
    this.lookAtHeight = options.lookAtHeight ?? 1;
    this.damping = options.damping ?? 0.1;

    // Initialize current position to camera position
    this.currentPosition.copy(camera.position);
    this.currentLookAt.set(0, this.lookAtHeight, 0);
  }

  /**
   * Set the target object to follow
   */
  setTarget(target: THREE.Object3D | null): void {
    this.target = target;

    if (!target) return;

    // Initialize camera position behind target
    this.calculateIdealOffset();
    this.calculateIdealLookAt();
    this.currentPosition.copy(this.idealOffset);
    this.currentLookAt.copy(this.idealLookAt);
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  private calculateIdealOffset(): void {
    if (!this.target) return;

    // Position camera behind the target based on its rotation
    // Negative Z places camera behind the fox (fox faces +Z in local space)
    this.idealOffset.set(0, this.height, -this.distance);

    // Rotate offset by target's Y rotation
    this.idealOffset.applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      this.target.rotation.y,
    );

    // Add target position
    this.idealOffset.add(this.target.position);
  }

  private calculateIdealLookAt(): void {
    if (!this.target) return;

    // Look at a point slightly above the target
    this.idealLookAt.copy(this.target.position);
    this.idealLookAt.y += this.lookAtHeight;
  }

  /**
   * Update camera position - call each frame
   */
  update(): void {
    if (!this.target) return;

    this.calculateIdealOffset();
    this.calculateIdealLookAt();

    // Smoothly interpolate current position/lookAt toward ideal
    this.currentPosition.lerp(this.idealOffset, this.damping);
    this.currentLookAt.lerp(this.idealLookAt, this.damping);

    // Apply to camera
    this.camera.position.copy(this.currentPosition);
    this.camera.lookAt(this.currentLookAt);
  }

  dispose(): void {
    this.target = null;
  }
}
