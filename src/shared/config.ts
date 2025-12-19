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

  // Floating capsule controller (dynamic rigidbody with spring-damper hover)
  // Inspired by Toyful Games' Very Very Valet and pmndrs/ecctrl
  floatingCapsule: {
    // Capsule dimensions
    radius: 0.35,
    halfHeight: 0.25,

    // Floating spring-damper system
    floatingDistance: 0.3, // Target hover distance from ground
    rayLength: 0.8, // Ground detection ray length
    springStrength: 1.2, // Spring constant (higher = snappier)
    springDamping: 0.08, // Damping coefficient (higher = less bouncy)

    // Movement forces
    moveForce: 30, // Base movement force
    sprintMultiplier: 1.8, // Sprint force multiplier
    airControlMultiplier: 0.3, // Air control reduction
    maxVelocity: 8, // Maximum horizontal velocity

    // Jump
    jumpForce: 8, // Impulse force for jump
    coyoteTime: 150, // ms grace period after leaving ground
    jumpBufferTime: 100, // ms to buffer jump input before landing

    // Ground detection
    groundedThreshold: 0.05, // Additional threshold for grounded state
    slopeLimit: 50, // Max slope angle in degrees

    // Physics properties
    mass: 1,
    friction: 0.0, // Low friction for smooth sliding
    linearDamping: 0.5, // Air resistance
    angularDamping: 1.0, // Prevent spinning
  },

  // Terrain configuration
  terrain: {
    size: 100, // World units (X and Z)
    segments: 128, // Grid resolution (128x128 = 16,641 vertices)
    noiseScale: 0.02, // Frequency (lower = larger hills)
    amplitude: 2.5, // Max height variation in units
    octaves: 4, // Detail layers
    persistence: 0.5, // Amplitude falloff per octave
    seed: 42, // Deterministic seed for reproducible terrain
  },

  // Entity limits
  entities: {
    maxCount: 1000,
  },

  // Buffer configuration
  buffers: {
    maxEntities: 64,
    floatsPerEntity: 14, // current (7) + previous (7)
    controlHeaderSize: 2, // frameCounter, entityCount
  },

  // Animation settings
  animations: {
    crossFadeDuration: 0.5,
  },

  // Resource loading
  resources: {
    loadTimeout: 30000,
  },

  // Debug visualization
  debug: {
    colliderColor: 0x00ff00,
    colliderOpacity: 0.5,
  },
} as const;

export type Config = typeof config;
