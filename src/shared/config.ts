/**
 * Application configuration constants
 *
 * Centralized config for renderer, physics, and shared systems.
 * Keep this file free of DOM or Three.js dependencies.
 */

export const config = {
  // Renderer
  renderer: {
    clearColor: "#211d20",
    toneMapping: "cineon" as const,
    toneMappingExposure: 1.75,
    maxPixelRatio: 2,
  },

  // Camera
  camera: {
    fov: 35,
    near: 0.1,
    far: 100,

    // Follow camera settings
    follow: {
      distance: 10,
      height: 5,
      lookAtHeight: 1,
      damping: 0.1,
    },
  },

  // Shadows
  shadows: {
    enabled: true,
    mapSize: 1024,
  },

  // Physics
  physics: {
    gravity: { x: 0, y: -20, z: 0 },
    interval: 1000 / 60, // 16.667ms for 60Hz
  },

  // Player movement
  player: {
    moveSpeed: 3,
    sprintMultiplier: 2,
    turnSpeed: 3,
  },

  // Character controller
  characterController: {
    capsuleRadius: 0.3,
    capsuleHeight: 0.8,
    stepHeight: 0.3,
    maxSlopeAngle: 45,
    minSlopeSlideAngle: 30,
  },

  // Ground plane
  ground: {
    dimensions: { x: 100, y: 1, z: 100 },
    position: { x: 0, y: -0.5, z: 0 },
  },

  // Entity limits
  entities: {
    maxCount: 1000,
  },
} as const;

export type Config = typeof config;
