/**
 * Scene configuration constants
 */
export const config = {
  // Renderer
  clearColor: "#211d20",
  toneMapping: "cineon" as const,
  toneMappingExposure: 1.75,

  // Camera
  camera: {
    fov: 35,
    near: 0.1,
    far: 100,
    position: { x: 6, y: 4, z: 8 },
  },

  // Shadows
  shadows: {
    enabled: true,
    mapSize: 1024,
  },

  // Performance
  maxPixelRatio: 2,
} as const;

export type Config = typeof config;
