# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server**: `bun run dev` - Start Vite dev server with HMR
- **Build**: `bun run build` - TypeScript check + Vite production build
- **Preview**: `bun run preview` - Preview production build locally

## Debug Mode

Add `#debug` to the URL (e.g., `http://localhost:5173/#debug`) to enable:
- Tweakpane debug UI
- Stats.js performance monitor (FPS, MS, MB)
- Cube Storm controls (spawn/clear physics cubes for stress testing)

## Architecture

Multi-worker Three.js application with physics. See `docs/architecture.md` for full details.

### Design Principles

1. **Workers are thin** - Worker files are just Comlink entry points, not application logic
2. **Domain-based organization** - Code is organized by what it does (`renderer/`, `physics/`), not where it runs
3. **Experience/World/Renderer pattern** - Bruno Simon-style architecture with dependency injection
4. **Centralized config** - All settings in `src/shared/config.ts`
5. **Explicit contracts** - `shared/` contains only cross-worker types and buffers

### Experience/World/Renderer Pattern

```
Experience (orchestrator) - index.ts
    ├── Renderer (WebGPURenderer wrapper) - renderer.ts
    ├── Camera (PerspectiveCamera + follow) - camera.ts
    ├── World (entities + scene objects) - world.ts
    ├── TransformSync (physics interpolation) - transform-sync.ts
    └── Time, Debug, Resources, InputState
```

### Project Structure

```
src/
  main.ts                 # Entry point
  
  app/                    # Main thread orchestration
  renderer/               # Three.js domain code (WebGPU)
    index.ts              # Experience (orchestrator)
    renderer.ts           # WebGPURenderer wrapper
    camera.ts             # PerspectiveCamera + follow
    world.ts              # Entity + scene management
    transform-sync.ts     # Physics interpolation
    entities/             # Entity component system
    objects/              # Visual components (fox, floor, instanced-cubes)
  physics/                # Rapier domain code
  workers/                # Thin worker entry points
  shared/                 # Cross-worker types, buffers, config
  shaders/                # Shared GLSL utilities
```

### Path Aliases

- `~/app` → `src/app/`
- `~/shared` → `src/shared/`
- `~/shaders` → `src/shaders/`

Domain folders (`renderer/`, `physics/`) use relative imports.

### Configuration

All settings live in `src/shared/config.ts`:

```typescript
import { config } from "~/shared/config";

config.renderer.clearColor      // "#211d20"
config.camera.fov               // 35
config.camera.follow.distance   // 10
config.physics.gravity          // { x: 0, y: -20, z: 0 }
config.player.moveSpeed         // 3
config.shadows.mapSize          // 1024
```

### Adding a New Worker

1. Create domain folder: `src/audio/index.ts`
2. Create thin worker entry: `src/workers/audio.worker.ts`
3. Add API types: `src/shared/types/audio-api.ts`
4. Register in WorkerBridge

### Adding Scene Objects

Create in `renderer/objects/` and instantiate in `World.createSceneObjects()`:

```typescript
// renderer/objects/my-object.ts
import * as THREE from "three/webgpu";
import type Resources from "../systems/resources";
import type Time from "../systems/time";

export default class MyObject {
  private scene: THREE.Scene;
  private mesh: THREE.Mesh;
  private unsubscribeTick: (() => void) | null = null;

  constructor(scene: THREE.Scene, resources: Resources, time: Time) {
    this.scene = scene;
    
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.scene.add(this.mesh);

    this.unsubscribeTick = time.on("tick", ({ elapsed }) => {
      this.mesh.rotation.y = elapsed * 0.001;
    });
  }

  dispose(): void {
    this.unsubscribeTick?.();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.scene.remove(this.mesh);
  }
}
```

### GLSL Shaders

- **Co-locate with component**: `renderer/objects/plane/vertex.vert`
- **Shared utilities**: `src/shaders/` for reusable GLSL chunks

```typescript
import vertexShader from "./vertex.vert";
import fragmentShader from "./fragment.frag";
```

### Entity System

Entities have a unique `EntityId` tracked across workers. See `docs/entities.md`.

```typescript
import { createEntityId } from "~/shared/types";

const id = createEntityId();  // Branded number type
await physicsApi.spawnEntity(id, transform, bodyConfig);
await renderApi.spawnEntity(id, "player");
```

### SharedArrayBuffer

Physics writes transforms, Render reads them (zero-copy). See `docs/interpolation.md`.

```typescript
// Physics worker writes
sharedBuffer.writeTransform(index, posX, posY, posZ, rotX, rotY, rotZ, rotW);
sharedBuffer.writeFrameTiming(performance.now(), PHYSICS_INTERVAL);
sharedBuffer.signalFrameComplete();

// Render worker reads (via TransformSync)
const timing = sharedBuffer.readFrameTiming();
const alpha = (now - timing.currentTime) / timing.interval;
const transform = sharedBuffer.readTransform(index);
// Interpolate between previous and current
```

Requires COOP/COEP headers (configured in `vite.config.ts`).
