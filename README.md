# Three.js Starter

A modern Three.js boilerplate inspired by [Bruno Simon's](https://threejs-journey.com/) course structure, with several architectural improvements.

## Key Differences from Bruno's Approach

- **TypeScript** - Full type safety throughout
- **Bun** - Fast package manager and runtime
- **Dependency Injection** - Classes receive dependencies via constructor instead of singleton pattern
- **Type-safe EventEmitter** - Generic event emitter with typed payloads instead of a generic callback system
- **Stats.js** - Performance monitoring in debug mode
- **Shader Examples** - Includes GLSL shader integration with `vite-plugin-glsl`
- **Up-to-date Dependencies** - All packages are current (Three.js r182, Vite, TypeScript 5.9)

## Getting Started

```bash
bun install
bun run dev
```

## Debug UI

Add `#debug` to the URL to enable Tweakpane controls and Stats.js performance monitor.

## Project Structure

```
src/
├── constants/
│   ├── config.ts        # Scene configuration
│   └── sources.ts       # Asset definitions
├── experience/
│   ├── index.ts         # Main orchestrator
│   ├── camera.ts        # Camera + OrbitControls
│   ├── renderer.ts      # WebGL renderer
│   └── world/
│       ├── objects/     # Scene meshes (floor, fox, plane)
│       └── systems/     # Non-mesh systems (environment, lighting)
├── shaders/             # Shared GLSL utilities
├── types/
│   └── resources.ts     # Resource type definitions
└── utils/
    ├── debug.ts         # Tweakpane + Stats.js wrapper
    ├── events.ts        # Type-safe EventEmitter
    ├── resources.ts     # Asset loader with progress events
    ├── sizes.ts         # Viewport (resize events)
    └── time.ts          # Animation loop (tick events)
```

## Path Aliases

All imports use `~/` prefix for project-specific modules:

```typescript
import { config, sources } from "~/constants";
import { Time, Sizes, Debug } from "~/utils";
import type { Source } from "~/types";
```

## Loading Progress

Subscribe to resource loading progress:

```typescript
resources.on("progress", ({ loaded, total, progress }) => {
  console.log(`Loading: ${Math.round(progress * 100)}%`);
});

resources.on("ready", () => {
  console.log("All assets loaded!");
});
```
