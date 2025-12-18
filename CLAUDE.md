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

## Architecture

Multi-worker Three.js application with physics. See `docs/architecture.md` for full details.

### Design Principles

1. **Workers are thin** - Worker files are just Comlink entry points, not application logic
2. **Domain-based organization** - Code is organized by what it does (`renderer/`, `physics/`), not where it runs
3. **Flat structure** - Minimal nesting, ~10 files per domain folder
4. **Explicit contracts** - `shared/` contains only cross-worker types and buffers

### Project Structure

```
src/
  main.ts                 # Entry point
  
  app/                    # Main thread orchestration
  renderer/               # Three.js domain code (flat)
  physics/                # Rapier domain code (flat)
  workers/                # Thin worker entry points
  shared/                 # Cross-worker types & buffers
  shaders/                # Shared GLSL utilities
```

### Path Aliases

- `~/app` → `src/app/`
- `~/shared` → `src/shared/`
- `~/shaders` → `src/shaders/`

Domain folders (`renderer/`, `physics/`) use relative imports.

### Adding a New Worker

1. Create domain folder: `src/audio/index.ts`
2. Create thin worker entry: `src/workers/audio.worker.ts`
3. Add API types: `src/shared/types/audio-api.ts`
4. Register in WorkerBridge

### Adding Scene Objects

Create a flat file in `renderer/`:

```typescript
// renderer/my-object.ts
import * as THREE from "three";
import type Resources from "./resources";
import type Time from "./time";

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

- **Co-locate with component**: `renderer/plane.vert`, `renderer/plane.frag`
- **Shared utilities**: `src/shaders/` for reusable GLSL chunks

```typescript
import vertexShader from "./plane.vert";
import fragmentShader from "./plane.frag";
```

### Entity System

Entities have a unique `EntityId` tracked across workers:

```typescript
import { createEntityId } from "~/shared/types";

const id = createEntityId();  // Branded number type
await physicsApi.spawnEntity(id, transform, bodyConfig);
await renderApi.spawnEntity(id, "player");
```

### SharedArrayBuffer

Physics writes transforms, Render reads them (zero-copy):

```typescript
// Physics worker writes
sharedBuffer.writeTransform(index, posX, posY, posZ, rotX, rotY, rotZ, rotW);
sharedBuffer.signalFrameComplete();

// Render worker reads
const transform = sharedBuffer.readTransform(index);
```

Requires COOP/COEP headers (configured in `vite.config.ts`).
