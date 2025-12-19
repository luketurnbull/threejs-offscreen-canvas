# Three.js WebGPU Multi-Worker Starter

A high-performance Three.js boilerplate featuring WebGPU rendering and Rapier physics, each running in dedicated Web Workers. Achieves smooth 120Hz+ visuals from 60Hz physics through timestamp-based interpolation over SharedArrayBuffer.

## Features

- **WebGPU Rendering** - Modern GPU API via Three.js WebGPURenderer (WebGL2 fallback available)
- **OffscreenCanvas** - Rendering runs entirely in a Web Worker, freeing the main thread
- **Rapier Physics** - 3D rigid body simulation in a dedicated worker at fixed 60Hz
- **SharedArrayBuffer** - Zero-copy transform synchronization between workers
- **Timestamp Interpolation** - Smooth motion at any display refresh rate
- **Floating Capsule Controller** - Spring-damper based character movement with coyote time
- **Procedural Terrain** - Deterministic heightfield with Simplex noise
- **GPU Instancing** - Stress test with 1000+ physics cubes in a single draw call
- **Entity System** - Factory + registry pattern for extensible entity types
- **TypeScript** - Full type safety with branded types for EntityIds
- **Debug Tools** - Tweakpane UI, Stats.js, physics collider visualization

## Quick Start

```bash
bun install
bun run dev
```

Open `http://localhost:5173` - use WASD to move, Space to jump, Shift to sprint.

Add `#debug` to the URL for debug controls and performance stats.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              MAIN THREAD                                     │
│                                                                              │
│   ┌─────────┐    ┌─────────────┐    ┌─────────────┐    ┌───────────────┐    │
│   │   App   │───>│WorkerBridge │───>│InputManager │    │ DebugManager  │    │
│   └─────────┘    └──────┬──────┘    └─────────────┘    └───────────────┘    │
│                         │                                                    │
└─────────────────────────┼────────────────────────────────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
          ▼               ▼               ▼
┌─────────────────┐  ┌─────────┐  ┌─────────────────┐
│  PHYSICS WORKER │  │ Shared  │  │  RENDER WORKER  │
│                 │  │ Array   │  │                 │
│   PhysicsWorld  │──│ Buffer  │──│   Experience    │
│    (Rapier)     │  │         │  │   (Three.js)    │
│                 │  └─────────┘  │                 │
│   60Hz fixed    │               │  WebGPURenderer │
│   setTimeout    │               │  ~120Hz (rAF)   │
└─────────────────┘               └─────────────────┘
```

### How It Works

1. **Physics Worker** runs Rapier at a fixed 60Hz timestep, writing transforms and timestamps to SharedArrayBuffer
2. **Render Worker** reads transforms each frame, calculates interpolation alpha from timestamps, and smoothly blends between physics states
3. **Main Thread** handles input capture, debug UI, and worker orchestration - no heavy computation

### Key Technologies

| Technology | Purpose |
|------------|---------|
| [Three.js WebGPU](https://threejs.org/docs/#api/en/renderers/WebGPURenderer) | Modern GPU rendering with lower driver overhead |
| [Rapier](https://rapier.rs/) | Fast 3D physics engine (WASM) |
| [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) | Zero-copy memory sharing between workers |
| [Comlink](https://github.com/GoogleChromeLabs/comlink) | Type-safe RPC for worker communication |
| [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas) | Canvas rendering in workers |

## Project Structure

```
src/
  main.ts                       # Entry point, feature detection
  
  app/                          # Main thread orchestration
    index.ts                    # App class (coordinator)
    worker-bridge.ts            # Worker lifecycle & entity spawning
    canvas-manager.ts           # OffscreenCanvas transfer
    input-manager.ts            # Keyboard event capture
    debug-manager.ts            # Tweakpane + Stats.js UI
    
  renderer/                     # Three.js domain (render worker)
    core/
      experience.ts             # Orchestrator (Bruno Simon pattern)
      renderer.ts               # WebGPURenderer wrapper
      camera.ts                 # Third-person follow camera
    world/
      world.ts                  # Entity + scene object management
      environment.ts            # Lighting setup
    entities/                   # Entity component system
      components/
        player.ts               # Fox character + animations
        ground.ts               # Invisible physics proxy
        dynamic-box.ts          # Physics box entity
        dynamic-sphere.ts       # Physics sphere entity
    objects/                    # Visual components
      fox.ts                    # Animated GLTF model
      floor.ts                  # Ground plane mesh
      instanced-cubes.ts        # GPU-instanced cube rendering
    sync/
      transform-sync.ts         # Physics interpolation
      physics-debug-renderer.ts # Collider visualization
    systems/
      time.ts                   # requestAnimationFrame loop
      resources.ts              # Asset loading
      
  physics/                      # Rapier domain (physics worker)
    physics-world.ts            # World + body management
    floating-capsule-controller.ts  # Player character controller
    
  workers/                      # Thin worker entry points
    render.worker.ts            # Comlink.expose(renderApi)
    physics.worker.ts           # Comlink.expose(physicsApi)
    
  shared/                       # Cross-worker contracts
    config.ts                   # Centralized configuration
    types/                      # API interfaces, EntityId
    buffers/                    # SharedTransformBuffer
    utils/                      # EventEmitter, noise, terrain
```

## Debug Mode

Add `#debug` to the URL to enable:

- **Tweakpane UI** - Adjust renderer, camera, physics settings live
- **Stats.js** - FPS, frame time, memory usage
- **Physics Colliders** - Green wireframe visualization
- **Cube Storm** - Stress test with physics cubes

### Cube Storm Controls

| Button | Action |
|--------|--------|
| Drop 100 Cubes | Spawn 100 physics cubes above the terrain |
| Drop 500 Cubes | Spawn 500 physics cubes (stress test) |
| Clear All Cubes | Remove all spawned cubes |

## Configuration

All settings are centralized in `src/shared/config.ts`:

```typescript
import { config } from "~/shared/config";

// Renderer
config.renderer.clearColor        // "#211d20"
config.renderer.toneMappingExposure // 1.75

// Camera
config.camera.fov                 // 35
config.camera.follow.distance     // 10
config.camera.follow.height       // 5

// Physics
config.physics.gravity            // { x: 0, y: -20, z: 0 }

// Floating Capsule Controller
config.floatingCapsule.springStrength  // 1.2
config.floatingCapsule.jumpForce       // 8
config.floatingCapsule.coyoteTime      // 150ms

// Terrain
config.terrain.amplitude          // 2.5
config.terrain.seed               // 42
```

## Transform Interpolation

The render worker interpolates between physics frames for smooth motion:

```typescript
// Physics writes transforms at 60Hz with timestamps
sharedBuffer.writeTransform(index, pos, rot);
sharedBuffer.writeFrameTiming(now, interval);
sharedBuffer.signalFrameComplete();

// Render calculates alpha and interpolates
const timing = sharedBuffer.readFrameTiming();
const alpha = (now - timing.currentTime) / timing.interval;
position = lerp(previous, current, alpha);
rotation = slerp(previous, current, alpha);
```

This implements Glenn Fiedler's ["Fix Your Timestep!"](https://gafferongames.com/post/fix_your_timestep/) pattern for smooth, jitter-free motion regardless of display refresh rate.

## Entity System

Entities use a factory + registry pattern for extensibility:

```typescript
// Register entity types (startup)
entityRegistry.register("player", createPlayerEntity);
entityRegistry.register("dynamic-box", createDynamicBoxEntity);

// Create at runtime
const entity = await entityFactory.create(id, "player", data);
```

All entities implement `RenderComponent` with lifecycle hooks:

| Hook | When Called | Use Case |
|------|-------------|----------|
| `onTransformUpdate` | After interpolated transform applied | Custom positioning |
| `onPhysicsFrame` | New physics data arrives (~60Hz) | Input-driven state |
| `onRenderFrame` | Every render frame | Animations, shaders |
| `dispose` | Entity removed | Cleanup resources |

## Adding New Workers

1. **Create domain module**: `src/audio/index.ts`
2. **Create worker entry**: `src/workers/audio.worker.ts`
3. **Add API types**: `src/shared/types/audio-api.ts`
4. **Register in WorkerBridge**

See [docs/architecture.md](docs/architecture.md) for detailed instructions.

## Browser Support

**Required:**
- OffscreenCanvas (Chrome 69+, Firefox 105+, Safari 16.4+)
- SharedArrayBuffer (requires COOP/COEP headers)
- ES Modules in Workers
- WebGPU (Chrome 113+, Firefox 127+, Safari 18+) or WebGL2 fallback

**No fallback** - shows error overlay if unsupported.

## Deployment

### Vercel

The project includes `vercel.json` with required Cross-Origin Isolation headers:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

### Other Hosts

Ensure your server sends these headers for SharedArrayBuffer support:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

## Known Issues

### First Load Vibration

On first page load (cold cache), there may be brief character vibration. This resolves on page reload and appears to be a worker initialization race condition. The physics and render workers sync correctly after initial setup completes.

### Subtle Movement Vibration

There's ongoing work to eliminate subtle vibration during character movement. The interpolation system works well, but timing jitter from `setTimeout` in the physics worker can cause minor inconsistencies. See [docs/interpolation.md](docs/interpolation.md) for debugging history and potential future fixes.

## Documentation

| Document | Description |
|----------|-------------|
| [architecture.md](docs/architecture.md) | Full system design, patterns, adding workers |
| [entities.md](docs/entities.md) | Entity component system, adding new types |
| [physics.md](docs/physics.md) | Floating capsule controller, terrain, colliders |
| [interpolation.md](docs/interpolation.md) | Transform sync, timing, known issues |

## Scripts

```bash
bun run dev      # Start Vite dev server with HMR
bun run build    # TypeScript check + production build
bun run preview  # Preview production build
```

## Credits

- Architecture inspired by [Bruno Simon's Three.js Journey](https://threejs-journey.com/)
- Floating capsule controller inspired by [Toyful Games](https://www.toyfulgames.com/) and [pmndrs/ecctrl](https://github.com/pmndrs/ecctrl)
- Interpolation based on [Glenn Fiedler's "Fix Your Timestep!"](https://gafferongames.com/post/fix_your_timestep/)

## License

MIT
