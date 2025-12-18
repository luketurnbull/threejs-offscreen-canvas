# Architecture

Multi-worker architecture for high-performance 3D rendering with physics simulation.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            MAIN THREAD                                   │
│                                                                          │
│   ┌─────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐      │
│   │   App   │──│WorkerBridge │──│InputManager │  │ DebugManager  │      │
│   └─────────┘  └──────┬──────┘  └─────────────┘  └───────────────┘      │
│                       │                                                  │
└───────────────────────┼──────────────────────────────────────────────────┘
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
    │     ├── Floor, PlaneShader, Environment
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
    worker-bridge.ts          # Worker lifecycle & communication
    canvas-manager.ts         # Canvas & OffscreenCanvas transfer
    input-manager.ts          # DOM event capture & serialization
    debug-manager.ts          # Tweakpane & Stats.js UI
    
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
      events.ts               # Event types
      resources.ts            # Asset types
    buffers/
      index.ts                # Re-exports
      transform-buffer.ts     # SharedTransformBuffer class
    utils/
      event-emitter.ts        # Type-safe pub/sub
      
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

```typescript
// 1. Create workers
const physicsWorker = new Worker(new URL("../workers/physics.worker.ts", import.meta.url));
const renderWorker = new Worker(new URL("../workers/render.worker.ts", import.meta.url));

// 2. Wrap with Comlink
const physicsApi = Comlink.wrap<PhysicsApi>(physicsWorker);
const renderApi = Comlink.wrap<RenderApi>(renderWorker);

// 3. Create shared buffers
const sharedBuffer = new SharedTransformBuffer();
const buffers = sharedBuffer.getBuffers();

// 4. Initialize workers (order matters: physics before render)
await physicsApi.init(config.physics.gravity, buffers);
await renderApi.init(canvas, viewport, debug, buffers);

// 5. Start simulation
physicsApi.start();
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

4. **Register in WorkerBridge** (`src/app/worker-bridge.ts`):
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

## Browser Support

Requires:
- OffscreenCanvas (Chrome 69+, Firefox 105+, Safari 16.4+)
- SharedArrayBuffer (requires COOP/COEP headers)
- ES Modules in Workers

No fallback - shows error if unsupported.
