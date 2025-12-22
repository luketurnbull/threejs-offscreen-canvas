# Architecture

Multi-worker architecture for high-performance 3D rendering with physics simulation.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            MAIN THREAD                                   │
│                                                                          │
│   ┌─────────┐                                                           │
│   │   App   │──┬── WorkerCoordinator (worker lifecycle)                 │
│   └─────────┘  ├── EntityCoordinator (entity management)                │
│                │     ├── WorldSpawner (ground/terrain)                  │
│                │     ├── PlayerSpawner (player character)               │
│                │     ├── BoxSpawner (instanced boxes)                   │
│                │     └── SphereSpawner (instanced spheres)              │
│                ├── InputRouter (input → workers)                        │
│                ├── AudioBridge (audio callbacks)                        │
│                │     └── AudioManager (Web Audio API)                   │
│                ├── InputManager (DOM events)                            │
│                └── DebugManager (Tweakpane UI)                          │
└─────────────────────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
        ▼               ▼               ▼
┌───────────────┐  ┌─────────┐  ┌───────────────┐
│PHYSICS WORKER │  │ Shared  │  │ RENDER WORKER │
│               │  │ Array   │  │               │
│  PhysicsWorld │──│ Buffer  │──│  Experience   │
│   (Rapier)    │  │         │  │  (Three.js)   │
│               │  └─────────┘  │               │
│   60Hz fixed  │               │  ~60Hz (rAF)  │
└───────────────┘               └───────────────┘
```

## Main Thread Modules

The App class orchestrates four focused modules:

| Module | File | Responsibility |
|--------|------|----------------|
| WorkerCoordinator | `worker-coordinator.ts` | Worker lifecycle (create, init, dispose) |
| EntityCoordinator | `entities/index.ts` | Entity orchestration via sub-spawners |
| InputRouter | `input-router.ts` | Route input events to workers |
| AudioBridge | `audio-bridge.ts` | Wire audio callbacks to AudioManager |

### WorkerCoordinator

Manages worker lifecycle only - no entity logic, no input handling:

```typescript
const coordinator = new WorkerCoordinator();
await coordinator.init(canvas, viewport, debug, callbacks);

const physicsApi = coordinator.getPhysicsApi();
const renderApi = coordinator.getRenderApi();
const sharedBuffer = coordinator.getSharedBuffer();

coordinator.startPhysics();
coordinator.resize(viewport);
coordinator.dispose();
```

### EntityCoordinator

Orchestrates specialized sub-spawners for different entity types. WebSocket-ready API for future networked sync:

```typescript
const entities = new EntityCoordinator(physicsApi, renderApi, sharedBuffer);

// World setup (ground + player + initial objects)
await entities.initWorld();

// Batch spawning (uses InstancedMesh for performance)
await entities.spawnBoxes([
  { position: { x: 0, y: 5, z: 0 } },
  { position: { x: 1, y: 5, z: 0 }, size: { x: 1.5, y: 1.5, z: 1.5 } },
]);

await entities.spawnSpheres([
  { position: { x: -2, y: 5, z: 0 }, radius: 0.5 },
]);

// Clear all dynamic entities
await entities.clearAll();

// Counts
entities.getBoxCount();     // Number of boxes
entities.getSphereCount();  // Number of spheres
entities.getTotalCount();   // Total dynamic entities
```

#### Sub-Spawners

| Spawner | Purpose | Rendering |
|---------|---------|-----------|
| `WorldSpawner` | Ground/terrain heightfield | Single entity |
| `PlayerSpawner` | Player with floating capsule | Single entity |
| `BoxSpawner` | Dynamic boxes | InstancedMesh (1 draw call) |
| `SphereSpawner` | Dynamic spheres | InstancedMesh (1 draw call) |

### InputRouter

Converts DOM events to worker commands:

```typescript
const inputRouter = new InputRouter(physicsApi, renderApi);
inputRouter.handleInput(event);  // Routes keyboard → physics, all → render
```

### AudioBridge

Connects worker events to AudioManager (which must stay on main thread):

```typescript
const audioBridge = new AudioBridge();
await audioBridge.init();
audioBridge.setupCallbacks(physicsApi, renderApi);
audioBridge.unlockAudio();  // Called from user gesture
```

## Design Principles

### 1. Workers Are Thin Entry Points

Worker files contain only Comlink API exposure. All logic lives in domain modules.

```typescript
// workers/render.worker.ts - Contains API factory
import * as Comlink from "comlink";
import Experience from "../renderer";

function createRenderApi(): RenderApi {
  let experience: Experience | null = null;
  return {
    async init(canvas, viewport, debug, sharedBuffers) {
      experience = new Experience(canvas, viewport, debug, sharedBuffer);
    },
    // ... delegate methods to experience
  };
}

Comlink.expose(createRenderApi());
```

### 2. Domain-Based Organization

Code is organized by **what it does**, not where it runs:

| Folder | Purpose |
|--------|---------|
| `renderer/` | All Three.js rendering code |
| `physics/` | All Rapier physics code |
| `app/` | Main thread orchestration |
| `shared/` | Cross-worker contracts |
| `workers/` | Thin entry points only |

### 3. Experience/World/Renderer Pattern

Inspired by Bruno Simon's Three.js Journey architecture, using dependency injection instead of singletons:

```
Experience (orchestrator)
    │
    ├── Renderer (WebGLRenderer wrapper)
    ├── Camera (PerspectiveCamera + follow behavior)
    ├── World (entities + scene objects)
    │     ├── EntityFactory
    │     ├── Floor, Environment
    │     ├── InstancedBoxes, InstancedSpheres (GPU instancing)
    │     └── Entities (player, ground, etc.)
    ├── TransformSync (physics interpolation)
    ├── Time, Debug, Resources, InputState
    └── THREE.Scene
```

Each class has a single responsibility:

| Class | File | Responsibility |
|-------|------|----------------|
| Experience | `index.ts` | Entry point, orchestrator, update loop |
| Renderer | `renderer.ts` | WebGLRenderer config/render/resize |
| Camera | `camera.ts` | PerspectiveCamera + third-person follow |
| World | `world.ts` | Entity + scene object management |
| TransformSync | `transform-sync.ts` | Physics-to-render interpolation |
| InstancedBoxes | `instanced-boxes.ts` | GPU-instanced box rendering |
| InstancedSpheres | `instanced-spheres.ts` | GPU-instanced sphere rendering |

### 4. Centralized Configuration

All configuration lives in `src/shared/config.ts`:

```typescript
export const config = {
  renderer: { clearColor, toneMappingExposure, maxPixelRatio },
  camera: { fov, near, far, position, follow: { distance, height, damping } },
  shadows: { enabled, mapSize },
  physics: { gravity, interval },
  player: { moveSpeed, sprintMultiplier, turnSpeed },
  characterController: { capsuleRadius, capsuleHeight, stepHeight, ... },
  ground: { dimensions, position },
  entities: { maxCount },
};
```

## Project Structure

```
src/
  main.ts                     # Entry point, feature detection
  
  app/                        # Main thread
    index.ts                  # App orchestrator
    worker-coordinator.ts     # Worker lifecycle management
    entities/                 # Entity coordination
      index.ts                # EntityCoordinator
      types.ts                # Spawn command types
      spawners/
        world-spawner.ts      # Ground/terrain spawning
        player-spawner.ts     # Player character spawning
        box-spawner.ts        # Instanced boxes spawning
        sphere-spawner.ts     # Instanced spheres spawning
    input-router.ts           # Input event routing
    audio-bridge.ts           # Audio callback wiring
    audio-manager.ts          # Web Audio API (main thread only)
    canvas-manager.ts         # Canvas & OffscreenCanvas transfer
    input-manager.ts          # DOM event capture & serialization
    debug-manager.ts          # Tweakpane & Stats.js UI
    components/               # UI components
      loading-screen.ts       # Loading progress + start button
      error-overlay.ts        # Error display
    
  renderer/                   # Three.js domain (runs in worker)
    index.ts                  # Experience class (orchestrator)
    renderer.ts               # Renderer class (WebGLRenderer wrapper)
    camera.ts                 # Camera class (PerspectiveCamera + follow)
    world.ts                  # World class (entities + scene objects)
    transform-sync.ts         # TransformSync (physics interpolation)
    time.ts                   # requestAnimationFrame loop
    resources.ts              # Asset loading (fetch + createImageBitmap)
    debug.ts                  # Debug bindings for worker
    input-state.ts            # Input state tracking
    sources.ts                # Asset definitions
    environment.ts            # Lighting & environment map
    entities/                 # Entity component system
      types.ts                # RenderComponent, EntityContext interfaces
      index.ts                # EntityFactory + EntityRegistry
      components/
        player.ts             # PlayerEntity (fox + animations)
        ground.ts             # GroundEntity (invisible physics proxy)
        static-mesh.ts        # Generic fallback entity
    objects/                  # Pure visual components (no entity logic)
      fox.ts                  # Animated character model
      floor.ts                # Ground plane mesh
      plane.ts                # Shader plane
      
  physics/                    # Rapier domain (runs in worker)
    index.ts                  # PhysicsWorld class
    floating-capsule-controller.ts  # Character controller
    
  workers/                    # Worker entry points (thin)
    render.worker.ts          # Comlink.expose(renderApi)
    physics.worker.ts         # Comlink.expose(physicsApi)
    
  shared/                     # Cross-worker contracts
    config.ts                 # Centralized configuration
    types/
      index.ts                # Re-exports
      entity.ts               # EntityId, Transform, EntitySpawnData
      physics-api.ts          # PhysicsApi interface
      render-api.ts           # RenderApi interface
      events.ts               # Event types (collision, footstep, etc.)
      audio.ts                # Audio event types
      resources.ts            # Asset types
    buffers/
      index.ts                # Re-exports
      transform-buffer.ts     # SharedTransformBuffer class
    utils/
      event-emitter.ts        # Type-safe pub/sub
      
  audio/                      # Audio utilities
    sound-pool.ts             # Pooled PositionalAudio instances
      
  shaders/                    # Shared GLSL utilities
```

## Workers

### Communication Pattern

Workers communicate via two mechanisms:

1. **Comlink RPC** - For commands and callbacks (async, serialized)
2. **SharedArrayBuffer** - For high-frequency data (zero-copy, synchronous)

```
Main Thread                    Workers
     │                            │
     │──── Comlink.wrap() ───────▶│  Type-safe RPC
     │◀─── Comlink.expose() ──────│
     │                            │
     │                            │
     │◀═══ SharedArrayBuffer ════▶│  Zero-copy memory
     │                            │
```

### Worker Lifecycle

Managed by `WorkerCoordinator`:

```typescript
// 1. Create shared buffers and workers
const coordinator = new WorkerCoordinator();
await coordinator.init(canvas, viewport, debug, callbacks);

// 2. Get APIs for dependent modules
const physicsApi = coordinator.getPhysicsApi();
const renderApi = coordinator.getRenderApi();
const sharedBuffer = coordinator.getSharedBuffer();

// 3. Create entity spawner
const spawner = new EntitySpawner(physicsApi, renderApi, sharedBuffer);
await spawner.spawnWorld();

// 4. Start physics loop
coordinator.startPhysics();
```

### Adding a New Worker

1. **Create domain module** (`src/audio/index.ts`):
   ```typescript
   export class AudioEngine {
     async init(): Promise<void> { /* ... */ }
     playSound(id: string): void { /* ... */ }
     dispose(): void { /* ... */ }
   }
   ```

2. **Create thin worker entry** (`src/workers/audio.worker.ts`):
   ```typescript
   import * as Comlink from "comlink";
   import { AudioEngine } from "../audio";

   const engine = new AudioEngine();
   
   const api = {
     init: () => engine.init(),
     playSound: (id: string) => engine.playSound(id),
     dispose: () => engine.dispose(),
   };

   Comlink.expose(api);
   ```

3. **Add API types** (`src/shared/types/audio-api.ts`):
   ```typescript
   export interface AudioApi {
     init(): Promise<void>;
     playSound(id: string): void;
     dispose(): void;
   }
   ```

4. **Add to WorkerCoordinator** (`src/app/worker-coordinator.ts`):
   ```typescript
   private audioWorker: Worker;
   private audioApi: Remote<AudioApi>;
   
   // In init()
   this.audioWorker = new Worker(
     new URL("../workers/audio.worker.ts", import.meta.url),
     { type: "module" }
   );
   this.audioApi = Comlink.wrap<AudioApi>(this.audioWorker);
   await this.audioApi.init();
   ```

## Entity System

> **See also**: [entities.md](./entities.md) for detailed entity component documentation.

### EntityId

Branded type for type-safe entity identification:

```typescript
// Branded type prevents accidental number usage
type EntityId = number & { readonly __brand: "EntityId" };

// Create new IDs
const id = createEntityId();  // Returns 1, 2, 3, ...
```

### Entity Component Pattern

The World class uses a factory + registry pattern for extensible entity types:

```typescript
// Register entity types (once at startup)
entityRegistry.register("player", createPlayerEntity);
entityRegistry.register("ground", createGroundEntity);

// Create entities via factory
const entity = await entityFactory.create(id, "player", data);
```

All entities implement the `RenderComponent` interface with lifecycle hooks:

```typescript
interface RenderComponent {
  readonly id: EntityId;
  readonly type: string;
  readonly object: THREE.Object3D;
  readonly mixer?: THREE.AnimationMixer;
  
  onTransformUpdate?(pos: Vector3, quat: Quaternion): void;
  onPhysicsFrame?(inputState: InputState): void;
  onRenderFrame?(delta: number, elapsed: number): void;
  dispose(): void;
}
```

### Entity Lifecycle

```
         Main Thread              Physics Worker          Render Worker
              │                         │                       │
              │                         │                       │
    createEntityId()                    │                       │
    registerEntity(id)                  │                       │
              │                         │                       │
              ├──── spawnEntity() ─────▶│                       │
              │                         │ Create RigidBody      │
              │                         │ rebuildEntityMap()    │
              │                         │                       │
              ├──── spawnEntity() ─────────────────────────────▶│
              │                         │              EntityFactory.create()
              │                         │              rebuildEntityMap()
              │                         │                       │
              │                         │                       │
              │         [Physics Loop]  │                       │
              │                         │ Step simulation       │
              │                         │ Write transforms ────▶│ Read transforms
              │                         │ Write timing ────────▶│ Calculate alpha
              │                         │ Signal frame ────────▶│ Interpolate
              │                         │                       │ Call lifecycle hooks
              │                         │                       │ Render
              │                         │                       │
```

### Transform Synchronization

Physics worker writes, Render worker reads (via TransformSync):

```typescript
// Physics: Write each entity's transform (shifts current→previous)
sharedBuffer.writeTransform(index, posX, posY, posZ, rotX, rotY, rotZ, rotW);

// Physics: Write timing for interpolation
sharedBuffer.writeFrameTiming(performance.now(), PHYSICS_INTERVAL);

// Physics: Signal frame complete (atomic increment)
sharedBuffer.signalFrameComplete();

// Render (TransformSync): Read timing and calculate interpolation alpha
const timing = sharedBuffer.readFrameTiming();
const alpha = (now - timing.currentTime) / timing.interval;

// Render (TransformSync): Read and interpolate between previous and current
const transforms = sharedBuffer.readTransform(index);
position.lerpVectors(transforms.previous, transforms.current, alpha);
```

## SharedArrayBuffer

> **See also**: [interpolation.md](./interpolation.md) for timestamp-based interpolation details.

### Memory Layout

```
Control Buffer (Int32Array):
┌────────────────┬─────────────┬────────────┬────────────┬─────┐
│ Frame Counter  │ Entity Count│ EntityId[0]│ EntityId[1]│ ... │
│    (atomic)    │   (atomic)  │            │            │     │
└────────────────┴─────────────┴────────────┴────────────┴─────┘
     Index 0          Index 1      Index 2      Index 3

Timing Buffer (Float64Array):
┌─────────────────────┬─────────────────────┬──────────────────┐
│ Current Frame Time  │ Previous Frame Time │ Physics Interval │
└─────────────────────┴─────────────────────┴──────────────────┘
        Index 0              Index 1              Index 2

Transform Buffer (Float32Array) - 14 floats per entity:
┌─────────────────────────────────────────────────────────────────────────────┐
│ Entity 0 CURRENT:  posX posY posZ rotX rotY rotZ rotW  (indices 0-6)        │
│ Entity 0 PREVIOUS: posX posY posZ rotX rotY rotZ rotW  (indices 7-13)       │
├─────────────────────────────────────────────────────────────────────────────┤
│ Entity 1 CURRENT:  posX posY posZ rotX rotY rotZ rotW  (indices 14-20)      │
│ Entity 1 PREVIOUS: posX posY posZ rotX rotY rotZ rotW  (indices 21-27)      │
└─────────────────────────────────────────────────────────────────────────────┘
```

The double-buffered transforms (previous + current) enable smooth interpolation between physics frames.

### Synchronization

Uses Atomics API for thread-safe coordination:

```typescript
// Write (non-atomic, protected by frame counter)
this.transformView[offset] = value;

// Signal (atomic increment)
Atomics.add(this.controlView, FRAME_COUNTER_INDEX, 1);

// Read frame counter (atomic load)
const frame = Atomics.load(this.controlView, FRAME_COUNTER_INDEX);
```

### Security Requirements

SharedArrayBuffer requires Cross-Origin Isolation headers:

```typescript
// vite.config.ts
server: {
  headers: {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  },
},
```

## Update Loop Flow

```
Experience.update(delta, elapsed)
│
├─→ TransformSync.update(entities)
│   ├─ Read timing from SharedArrayBuffer
│   ├─ Calculate interpolation alpha
│   ├─ Apply interpolated transforms to each entity
│   └─ Return: newPhysicsFrame boolean
│
├─→ World.update(delta, elapsed, newPhysicsFrame)
│   ├─ For each entity:
│   │   ├─ mixer?.update(deltaSeconds)
│   │   ├─ onRenderFrame?.(delta, elapsed)
│   │   └─ if newPhysicsFrame: onPhysicsFrame?.(inputState)
│
├─→ Camera.update()
│   └─ Follow target with damped movement
│
└─→ Renderer.render(scene, camera)
```

## Type Safety

### Branded Types

Prevent accidental type confusion:

```typescript
type EntityId = number & { readonly __brand: "EntityId" };
type BufferIndex = number & { readonly __brand: "BufferIndex" };

// Compile error: Type 'number' is not assignable to type 'EntityId'
const id: EntityId = 5;

// Correct usage
const id = createEntityId();
```

### Worker API Interfaces

Define contracts between main thread and workers:

```typescript
interface PhysicsApi {
  init(gravity: Vector3, sharedBuffers: SharedBuffers): Promise<void>;
  spawnEntity(entity: EntitySpawnData, config: PhysicsBodyConfig): Promise<void>;
  spawnPlayer(id: EntityId, transform: Transform, config: CharacterConfig): Promise<void>;
  removeEntity(id: EntityId): void;
  setPlayerInput(input: MovementInput): void;
  start(): void;
  pause(): void;
  dispose(): void;
}
```

### Event Emitter

Type-safe pub/sub pattern:

```typescript
type TimeEvents = {
  tick: { delta: number; elapsed: number };
};

class Time extends EventEmitter<TimeEvents> {
  // emit() is type-checked
  this.emit("tick", { delta: 16, elapsed: 1000 });
}

// on() returns unsubscribe function
const unsubscribe = time.on("tick", ({ delta, elapsed }) => {
  // delta and elapsed are typed as number
});
```

## WebGL Renderer

The project uses Three.js WebGLRenderer:

```typescript
import * as THREE from "three";

const renderer = new THREE.WebGLRenderer({
  canvas: offscreenCanvas,
  antialias: true,
  powerPreference: "high-performance",
});
```

### Why WebGL Instead of WebGPU

We previously experimented with WebGPURenderer but reverted to WebGL due to browser-level context exhaustion issues. When using WebGPU with OffscreenCanvas in a Web Worker, rapid page refreshes (~5 times) would exhaust Chrome's GPU adapter pool, causing initialization failures. This is a known limitation at the intersection of WebGPU, OffscreenCanvas, and Chrome's GPU process crash protection. See [gpu-context.md](./gpu-context.md) for full details.

WebGL provides:
- More mature and stable implementation
- Synchronous initialization (simpler code)
- Better browser support
- No context exhaustion issues with rapid refreshes

## Instanced Mesh Stress Testing

The project uses InstancedMesh for boxes and spheres, enabling hundreds of dynamic physics objects with minimal draw calls.

### Architecture

```
EntityCoordinator (Main Thread)
    │
    ├── BoxSpawner / SphereSpawner
    │     ├── Generate EntityIds
    │     ├── Register in SharedTransformBuffer
    │     │
    │     ├── physicsApi.spawnBodies(entityIds, positions, config)
    │     │   └── Creates Rapier RigidBodies for each entity
    │     │
    │     └── renderApi.addBoxes/addSpheres(entityIds, scales/radii)
    │         └── World.addBoxes/addSpheres()
    │             └── InstancedBoxes/InstancedSpheres
```

### Instanced Components

Both `InstancedBoxes` and `InstancedSpheres` share the same pattern:

```typescript
// Per-instance scale via transform matrix
const matrix = new THREE.Matrix4();
matrix.compose(position, quaternion, scale);
mesh.setMatrixAt(index, matrix);

// O(1) removal via swap-with-last pattern
removeInstance(entityId) {
  const lastIndex = this.activeCount - 1;
  if (index !== lastIndex) {
    // Swap with last instance
    this.swapInstances(index, lastIndex);
  }
  this.activeCount--;
}
```

### Debug Controls

Access via `#debug` URL hash:

| Control | Action |
|---------|--------|
| Drop 100 Cubes | Spawns 100 physics boxes |
| Drop 500 Cubes | Spawns 500 physics boxes |
| Clear All Cubes | Removes all dynamic entities |
| Cubes counter | Shows total entity count |

### Performance Characteristics

- **2 draw calls** for all boxes + spheres (1 per type)
- Per-instance scales
- O(1) instance removal (swap-with-last pattern)
- Zero-copy transform sync via SharedArrayBuffer
- Physics runs at fixed 60Hz, rendering at display refresh rate

## Browser Support

Requires:
- OffscreenCanvas (Chrome 69+, Firefox 105+, Safari 16.4+)
- SharedArrayBuffer (requires COOP/COEP headers)
- ES Modules in Workers
- WebGL2 (Chrome 56+, Firefox 51+, Safari 15+)

No fallback - shows error if unsupported.
