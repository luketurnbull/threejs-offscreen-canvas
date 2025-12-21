# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server**: `bun run dev` - Start Vite dev server with HMR
- **Build**: `bun run build` - TypeScript check + Vite production build
- **Preview**: `bun run preview` - Preview production build locally

## Debug Mode

Add `#debug` to the URL (e.g., `http://localhost:5173/#debug`) to enable:
- Tweakpane debug UI (renderer, camera, physics settings)
- Stats.js performance monitor (FPS, MS, MB)
- Physics collider visualization (green wireframes)
- Cube Storm controls (spawn/clear physics cubes for stress testing)

## Architecture

Multi-worker Three.js application with WebGPU rendering and Rapier physics. See `docs/architecture.md` for full details.

### Design Principles

1. **Workers are thin** - Worker files (`src/workers/`) are just Comlink entry points, all logic lives in domain modules
2. **Domain-based organization** - Code organized by what it does (`renderer/`, `physics/`), not where it runs
3. **Experience/World/Renderer pattern** - Bruno Simon-style architecture with dependency injection (no singletons)
4. **Centralized config** - All settings in `src/shared/config.ts`
5. **Explicit contracts** - `shared/` contains only cross-worker types, buffers, and utilities
6. **Zero-copy sync** - Physics writes to SharedArrayBuffer, render reads with interpolation

### Experience/World/Renderer Pattern

```
Experience (orchestrator) - core/experience.ts
    ├── Renderer (WebGPURenderer wrapper) - core/renderer.ts
    ├── Camera (PerspectiveCamera + follow) - core/camera.ts
    ├── World (entities + scene objects) - world/world.ts
    │   ├── EntityFactory + EntityRegistry
    │   ├── Floor, Environment
    │   ├── InstancedCubes
    │   └── PhysicsDebugRenderer
    ├── TransformSync (physics interpolation) - sync/transform-sync.ts
    └── Time, Debug, Resources, InputState - systems/
```

### Project Structure

```
src/
  main.ts                 # Entry point
  
  app/                    # Main thread orchestration
    index.ts              # App class (coordinator)
    worker-coordinator.ts # Worker lifecycle management
    entity-spawner.ts     # Entity creation across workers
    input-router.ts       # Input event routing
    audio-bridge.ts       # Audio callback wiring
    audio-manager.ts      # Web Audio API (main thread only)
    canvas-manager.ts     # OffscreenCanvas transfer
    input-manager.ts      # Keyboard event capture
    debug-manager.ts      # Tweakpane + Stats.js
    components/           # UI (loading-screen, error-overlay)
    
  renderer/               # Three.js domain code (WebGPU)
    core/
      experience.ts       # Orchestrator
      renderer.ts         # WebGPURenderer wrapper
      camera.ts           # PerspectiveCamera + follow
    world/
      world.ts            # Entity + scene management
      environment.ts      # Lighting
    entities/
      types.ts            # RenderComponent interface
      index.ts            # EntityFactory + Registry
      components/         # player, ground, dynamic-box, etc.
    objects/              # Visual components (fox, floor, instanced-cubes)
    sync/
      transform-sync.ts   # Physics interpolation
      physics-debug-renderer.ts
    systems/              # time, resources, debug, input-state
    
  physics/                # Rapier domain code
    physics-world.ts      # World + body management
    floating-capsule-controller.ts  # Player controller
    
  workers/                # Thin worker entry points
    render.worker.ts      # Comlink.expose(renderApi)
    physics.worker.ts     # Comlink.expose(physicsApi)
    
  shared/                 # Cross-worker types, buffers, config
    config.ts             # Centralized configuration
    types/                # EntityId, API interfaces
    buffers/              # SharedTransformBuffer
    utils/                # EventEmitter, noise, terrain
```

### Path Aliases

- `~/app` → `src/app/`
- `~/shared` → `src/shared/`
- `~/shaders` → `src/shaders/`

Domain folders (`renderer/`, `physics/`) use relative imports internally.

### Configuration

All settings live in `src/shared/config.ts`:

```typescript
import { config } from "~/shared/config";

config.renderer.clearColor           // "#211d20"
config.renderer.toneMappingExposure  // 1.75
config.camera.fov                    // 35
config.camera.follow.distance        // 10
config.physics.gravity               // { x: 0, y: -20, z: 0 }
config.floatingCapsule.springStrength // 1.2
config.floatingCapsule.jumpForce     // 8
config.terrain.amplitude             // 2.5
config.entities.maxCount             // 1000
```

## Key Patterns

### Adding a New Worker

1. Create domain folder: `src/audio/index.ts`
2. Create thin worker entry: `src/workers/audio.worker.ts`
3. Add API types: `src/shared/types/audio-api.ts`
4. Add to WorkerCoordinator

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

### Adding Entity Types

Create in `renderer/entities/components/` and register in `renderer/entities/index.ts`:

```typescript
// renderer/entities/components/tree.ts
import type { EntityId } from "~/shared/types";
import type { RenderComponent, EntityContext } from "../types";

export function createTreeEntity(
  id: EntityId,
  context: EntityContext,
  data?: Record<string, unknown>
): RenderComponent {
  // Create mesh, add to scene
  return {
    id,
    type: "tree",
    object: mesh,
    onRenderFrame(delta, elapsed) { /* animate */ },
    dispose() { /* cleanup */ },
  };
}

// In renderer/entities/index.ts
entityRegistry.register("tree", createTreeEntity);
```

Entity lifecycle hooks:
- `onTransformUpdate(pos, quat)` - After interpolated transform applied
- `onPhysicsFrame(inputState)` - New physics frame arrives (~60Hz)
- `onRenderFrame(delta, elapsed)` - Every render frame
- `dispose()` - Cleanup when removed

### Entity System

Entities have a unique `EntityId` tracked across workers. See `docs/entities.md`.

```typescript
import { createEntityId } from "~/shared/types";

const id = createEntityId();  // Branded number type
sharedBuffer.registerEntity(id);
await physicsApi.spawnEntity(id, transform, bodyConfig);
await renderApi.spawnEntity(id, "player");
```

### SharedArrayBuffer Transform Sync

Physics writes transforms, Render reads with interpolation. See `docs/interpolation.md`.

```typescript
// Physics worker writes (60Hz)
sharedBuffer.writeTransform(index, posX, posY, posZ, rotX, rotY, rotZ, rotW);
sharedBuffer.writeFrameTiming(performance.now(), PHYSICS_INTERVAL);
sharedBuffer.signalFrameComplete();

// Render worker reads and interpolates
const timing = sharedBuffer.readFrameTiming();
const alpha = (now - timing.currentTime) / timing.interval;
const transform = sharedBuffer.readTransform(index);
position = lerp(previous, current, alpha);
```

Requires COOP/COEP headers (configured in `vite.config.ts` and `vercel.json`).

### WebGPU Renderer

Uses Three.js WebGPURenderer which requires async initialization:

```typescript
import * as THREE from "three/webgpu";  // Note: webgpu import

const renderer = new THREE.WebGPURenderer({ canvas, antialias: true });
await renderer.init();  // Required before rendering
```

### Floating Capsule Controller

Player uses dynamic rigidbody with spring-damper floating, not kinematic. See `docs/physics.md`.

Key features:
- Spring force keeps character hovering above ground
- Impulse-based movement forces
- Jump with coyote time (150ms grace period) and input buffering
- Ground detection via raycast

### Procedural Terrain

Both physics and render generate identical terrain using seeded Simplex noise:

```typescript
import { generateTerrainHeights, getHeightAt } from "~/shared/utils/terrain";

const heights = generateTerrainHeights(config.terrain);
const y = getHeightAt(x, z, heights, config.terrain);
```

### GPU Instancing for Stress Testing

`InstancedCubes` renders up to 1000 physics cubes in a single draw call:

```typescript
// Important settings for instanced meshes with physics
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
mesh.frustumCulled = false;  // Instances scattered across large area
mesh.instanceMatrix.needsUpdate = true;  // After batch updates
```

## GLSL Shaders

- **Co-locate with component**: `renderer/objects/plane/vertex.vert`
- **Shared utilities**: `src/shaders/` for reusable GLSL chunks

```typescript
import vertexShader from "./vertex.vert";
import fragmentShader from "./fragment.frag";
```

## Known Issues

### First Load Vibration
Brief character vibration on cold page load, resolves on reload. Worker initialization race condition.

### Subtle Movement Vibration
Ongoing interpolation timing issue. `setTimeout` jitter in physics worker causes minor inconsistencies. Documented in `docs/interpolation.md` with potential fixes.

### InstancedMesh Frustum Culling
Must set `frustumCulled = false` on InstancedMesh when instances are scattered by physics. Otherwise all cubes disappear when camera moves (base geometry bounding sphere is tiny).

## Documentation

| Document | Description |
|----------|-------------|
| [docs/architecture.md](docs/architecture.md) | Full system design, worker patterns |
| [docs/entities.md](docs/entities.md) | Entity component system |
| [docs/physics.md](docs/physics.md) | Floating capsule, terrain, colliders |
| [docs/interpolation.md](docs/interpolation.md) | Transform sync, known issues |
