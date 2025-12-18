# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server**: `npm run dev` - Start Vite dev server with HMR
- **Build**: `npm run build` - TypeScript check + Vite production build
- **Preview**: `npm run preview` - Preview production build locally

## Debug Mode

Add `#debug` to the URL (e.g., `http://localhost:5173/#debug`) to enable:
- Tweakpane debug UI
- Stats.js performance monitor (FPS, MS, MB)

## Architecture

This is a Three.js starter using TypeScript and Vite with an event-driven class-based architecture.

### Path Aliases

- `~/utils` → `src/utils/` - Utility classes
- `~/types` → `src/types/` - Type definitions
- `~/constants` → `src/constants/` - Configuration and sources
- `~/experience/*` → `src/experience/*` - Experience classes
- `~/shaders/*` → `src/shaders/*` - Shared GLSL utilities

### Core Structure

**Experience** (`src/experience/index.ts`) - Main orchestrator that initializes all systems and manages the render loop via event subscriptions.

**Utils** (`src/utils/`):
- `EventEmitter` - Type-safe pub/sub base class used throughout
- `Time` - Emits `tick` events with `delta` and `elapsed` values each frame
- `Sizes` - Emits `resize` events with viewport dimensions
- `Resources` - Async asset loader that emits `progress` and `ready` events
- `Debug` - Tweakpane + Stats.js wrapper, active when URL hash is `#debug`

**Constants** (`src/constants/`):
- `config.ts` - Scene configuration (camera, renderer, shadows)
- `sources.ts` - Asset definitions

**World** (`src/experience/world/`) - Scene content organized by purpose:
- `objects/` - Meshes and models (floor, fox, plane)
- `systems/` - Non-mesh scene setup (environment, lighting)

### Resource Loading

Define assets in `src/constants/sources.ts` with `name`, `type` (`texture`, `cubeTexture`, `gltfModel`), and `path`. Access loaded assets via `resources.items[name]` after the `ready` event.

```typescript
// Track loading progress
resources.on("progress", ({ progress }) => {
  console.log(`${Math.round(progress * 100)}%`);
});
```

### GLSL Shaders

- **Component-specific shaders**: Co-locate with the component (e.g., `world/objects/plane/vertex.vert`)
- **Shared shader utilities**: Place in `src/shaders/` for reusable GLSL chunks

Import via `vite-plugin-glsl`:
```typescript
import vertexShader from "./vertex.vert";
```

### Adding Scene Objects

1. Create a class in `src/experience/world/objects/`
2. Store scene reference and any event unsubscribe functions
3. Instantiate in `World` constructor (after `resources.ready` if assets needed)
4. Subscribe to `time.on("tick")` for animations, storing the unsubscribe function
5. Implement `dispose()` to clean up geometry, materials, event subscriptions, and remove from scene

```typescript
export default class MyObject {
  private scene: THREE.Scene;
  private unsubscribeTick: (() => void) | null = null;
  
  constructor(scene: THREE.Scene, time: Time) {
    this.scene = scene;
    // ... create mesh
    this.unsubscribeTick = time.on("tick", () => this.update());
  }
  
  dispose(): void {
    this.unsubscribeTick?.();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.scene.remove(this.mesh);
  }
}
```
