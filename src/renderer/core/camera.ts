import * as THREE from "three";
import type { ViewportSize } from "~/shared/types";
import { config } from "~/shared/config";

export interface CameraOptions {
  fov?: number;
  near?: number;
  far?: number;
  distance?: number;
  height?: number;
  lookAtHeight?: number;
  damping?: number;
}

/**
 * Camera - PerspectiveCamera with third-person follow behavior
 *
 * Responsible for:
 * - Creating and managing THREE.PerspectiveCamera (exposed as `instance`)
 * - Third-person camera following of a target object
 * - Smooth damped camera movement
 * - Viewport resize handling
 */
export default class Camera {
  readonly instance: THREE.PerspectiveCamera;

  private target: THREE.Object3D | null = null;

  // Camera positioning for follow behavior
  private distance: number;
  private height: number;
  private lookAtHeight: number;
  private damping: number;

  // Internal state for smooth following
  private currentPosition = new THREE.Vector3();
  private currentLookAt = new THREE.Vector3();

  // Reusable vectors (avoid allocation in update loop)
  private idealOffset = new THREE.Vector3();
  private idealLookAt = new THREE.Vector3();
  private yAxis = new THREE.Vector3(0, 1, 0);

  constructor(
    scene: THREE.Scene,
    viewport: ViewportSize,
    options: CameraOptions = {},
  ) {
    // Create perspective camera using config defaults
    this.instance = new THREE.PerspectiveCamera(
      options.fov ?? config.camera.fov,
      viewport.width / viewport.height,
      options.near ?? config.camera.near,
      options.far ?? config.camera.far,
    );

    scene.add(this.instance);

    // Follow camera settings
    this.distance = options.distance ?? 10;
    this.height = options.height ?? 5;
    this.lookAtHeight = options.lookAtHeight ?? 1;
    this.damping = options.damping ?? 0.1;

    // Initialize current position to camera position
    this.currentPosition.copy(this.instance.position);
    this.currentLookAt.set(0, this.lookAtHeight, 0);
  }

  /**
   * Handle viewport resize
   */
  resize(viewport: ViewportSize): void {
    this.instance.aspect = viewport.width / viewport.height;
    this.instance.updateProjectionMatrix();
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
    this.instance.position.copy(this.currentPosition);
    this.instance.lookAt(this.currentLookAt);
  }

  private calculateIdealOffset(): void {
    if (!this.target) return;

    // Position camera behind the target based on its rotation
    // Negative Z places camera behind the fox (fox faces +Z in local space)
    this.idealOffset.set(0, this.height, -this.distance);

    // Rotate offset by target's Y rotation
    this.idealOffset.applyAxisAngle(this.yAxis, this.target.rotation.y);

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
    this.instance.position.copy(this.currentPosition);
    this.instance.lookAt(this.currentLookAt);
  }

  dispose(): void {
    this.target = null;
  }
}
