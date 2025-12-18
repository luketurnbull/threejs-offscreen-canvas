import * as THREE from "three";
import type { SerializedInputEvent } from "~/shared/types";

/**
 * OrbitControls - Custom orbit controls for Web Worker context
 *
 * Supports rotation and zoom only (no pan).
 * Receives serialized input events instead of DOM events.
 */
export default class OrbitControls {
  camera: THREE.PerspectiveCamera;
  target: THREE.Vector3;

  // Settings
  enableDamping: boolean = true;
  dampingFactor: number = 0.05;
  rotateSpeed: number = 1.0;
  zoomSpeed: number = 1.0;
  minDistance: number = 0.1;
  maxDistance: number = 100;
  minPolarAngle: number = 0;
  maxPolarAngle: number = Math.PI;

  // Internal state - spherical coordinates relative to target
  private spherical: THREE.Spherical = new THREE.Spherical();
  private sphericalDelta: THREE.Spherical = new THREE.Spherical();
  private scale: number = 1;
  private needsUpdate: boolean = false;

  // Pointer state
  private isRotating: boolean = false;
  private rotateStart: THREE.Vector2 = new THREE.Vector2();
  private rotateEnd: THREE.Vector2 = new THREE.Vector2();
  private rotateDelta: THREE.Vector2 = new THREE.Vector2();

  // Element dimensions for calculating rotation
  private elementWidth: number = 1;
  private elementHeight: number = 1;

  // Reusable vectors
  private offset: THREE.Vector3 = new THREE.Vector3();
  private quat: THREE.Quaternion;
  private quatInverse: THREE.Quaternion;

  constructor(camera: THREE.PerspectiveCamera, target?: THREE.Vector3) {
    this.camera = camera;
    this.target = target ?? new THREE.Vector3();

    // Create quaternion for Y-up rotation
    this.quat = new THREE.Quaternion().setFromUnitVectors(
      camera.up,
      new THREE.Vector3(0, 1, 0),
    );
    this.quatInverse = this.quat.clone().invert();

    // Initialize spherical from current camera position
    this.syncFromCamera();
  }

  setSize(width: number, height: number): void {
    this.elementWidth = width;
    this.elementHeight = height;
  }

  /**
   * Sync internal spherical state from camera position.
   * Call this after setting camera position externally.
   */
  syncFromCamera(): void {
    this.offset.copy(this.camera.position).sub(this.target);
    this.offset.applyQuaternion(this.quat);
    this.spherical.setFromVector3(this.offset);
  }

  handleEvent(event: SerializedInputEvent): void {
    switch (event.type) {
      case "pointerdown":
        this.onPointerDown(event.clientX, event.clientY, event.button);
        break;
      case "pointermove":
        this.onPointerMove(event.clientX, event.clientY);
        break;
      case "pointerup":
      case "pointercancel":
        this.onPointerUp();
        break;
      case "wheel":
        this.onWheel(event.deltaY);
        break;
    }
  }

  private onPointerDown(x: number, y: number, button: number): void {
    // Left click (button 0) for rotation
    if (button === 0) {
      this.isRotating = true;
      this.rotateStart.set(x, y);
    }
  }

  private onPointerMove(x: number, y: number): void {
    if (!this.isRotating) return;

    this.rotateEnd.set(x, y);
    this.rotateDelta.subVectors(this.rotateEnd, this.rotateStart);

    // Rotate left/right
    this.sphericalDelta.theta -=
      ((2 * Math.PI * this.rotateDelta.x) / this.elementWidth) *
      this.rotateSpeed;

    // Rotate up/down
    this.sphericalDelta.phi -=
      ((2 * Math.PI * this.rotateDelta.y) / this.elementHeight) *
      this.rotateSpeed;

    this.rotateStart.copy(this.rotateEnd);
    this.needsUpdate = true;
  }

  private onPointerUp(): void {
    this.isRotating = false;
  }

  private onWheel(deltaY: number): void {
    if (deltaY > 0) {
      this.scale /= Math.pow(0.95, this.zoomSpeed);
    } else if (deltaY < 0) {
      this.scale *= Math.pow(0.95, this.zoomSpeed);
    }
    this.needsUpdate = true;
  }

  update(): boolean {
    // Check if there's anything to update
    const hasDelta =
      Math.abs(this.sphericalDelta.theta) > 0.0001 ||
      Math.abs(this.sphericalDelta.phi) > 0.0001 ||
      Math.abs(this.scale - 1) > 0.0001;

    if (!hasDelta && !this.needsUpdate) {
      return false;
    }

    // Apply deltas to spherical
    if (this.enableDamping) {
      this.spherical.theta += this.sphericalDelta.theta * this.dampingFactor;
      this.spherical.phi += this.sphericalDelta.phi * this.dampingFactor;
    } else {
      this.spherical.theta += this.sphericalDelta.theta;
      this.spherical.phi += this.sphericalDelta.phi;
    }

    // Apply zoom
    this.spherical.radius *= this.scale;

    // Clamp values
    this.spherical.phi = Math.max(
      this.minPolarAngle,
      Math.min(this.maxPolarAngle, this.spherical.phi),
    );
    this.spherical.makeSafe();
    this.spherical.radius = Math.max(
      this.minDistance,
      Math.min(this.maxDistance, this.spherical.radius),
    );

    // Update camera position from spherical
    this.offset.setFromSpherical(this.spherical);
    this.offset.applyQuaternion(this.quatInverse);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);

    // Apply damping to deltas
    if (this.enableDamping) {
      this.sphericalDelta.theta *= 1 - this.dampingFactor;
      this.sphericalDelta.phi *= 1 - this.dampingFactor;
    } else {
      this.sphericalDelta.set(0, 0, 0);
    }

    // Reset scale and flag
    this.scale = 1;
    this.needsUpdate = false;

    return true;
  }

  dispose(): void {
    // Nothing to dispose in worker context
  }
}
