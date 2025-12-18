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
│  PhysicsWorld │──│ Buffer  │──│   Renderer    │
│   (Rapier)    │  │         │  │  (Three.js)   │
│               │  └─────────┘  │               │
│   60Hz fixed  │               │  ~60Hz (rAF)  │
└───────────────┘               └───────────────┘
```

## Design Principles

### 1. Workers Are Thin Entry Points

Worker files contain only Comlink API exposure. All logic lives in domain modules.

```typescript
// workers/render.worker.ts - THIN
import * as Comlink from "comlink";
import { createRenderApi } from "../renderer";
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

### 3. Flat Structure

Each domain folder is flat with ~10 files. No deep nesting.

```
renderer/
  index.ts          # Main orchestrator
  time.ts           # Animation loop
  resources.ts      # Asset loading
  camera.ts         # Camera controls
  floor.ts          # Scene object
  fox.ts            # Scene object
  plane.ts          # Scene object
  plane.vert        # Co-located shader
  plane.frag        # Co-located shader
  environment.ts    # Lighting setup
```

### 4. Explicit Contracts

`shared/` contains only what crosses worker boundaries:
- Type definitions (APIs, entities)
- SharedArrayBuffer wrappers
- EventEmitter base class

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
    index.ts                  # RenderExperience class
    time.ts                   # requestAnimationFrame loop
    resources.ts              # Asset loading (fetch + createImageBitmap)
    debug.ts                  # Debug bindings for worker
    camera.ts                 # FollowCamera controller
    input-state.ts            # Input state tracking
    config.ts                 # Renderer configuration
    sources.ts                # Asset definitions
    floor.ts                  # Ground plane
    fox.ts                    # Animated character
    plane.ts                  # Shader plane
    plane.vert                # Vertex shader
    plane.frag                # Fragment shader
    environment.ts            # Lighting & environment map
    
  physics/                    # Rapier domain (runs in worker)
    index.ts                  # PhysicsWorld class
    
  workers/                    # Worker entry points (thin)
    render.worker.ts          # Comlink.expose(renderApi)
    physics.worker.ts         # Comlink.expose(physicsApi)
    
  shared/                     # Cross-worker contracts
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
await physicsApi.init(gravity, buffers);
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

### EntityId

Branded type for type-safe entity identification:

```typescript
// Branded type prevents accidental number usage
type EntityId = number & { readonly __brand: "EntityId" };

// Create new IDs
const id = createEntityId();  // Returns 1, 2, 3, ...
```

### Entity Lifecycle

```
         Main Thread              Physics Worker          Render Worker
              │                         │                       │
              │                         │                       │
    createEntityId()                    │                       │
              │                         │                       │
              ├──── spawnEntity() ─────▶│                       │
              │                         │ Create RigidBody      │
              │                         │ Register in buffer    │
              │                         │                       │
              ├──── spawnEntity() ─────────────────────────────▶│
              │                         │                 Create Mesh
              │                         │                 Register in buffer
              │                         │                       │
              │                         │                       │
              │         [Physics Loop]  │                       │
              │                         │ Step simulation       │
              │                         │ Write transforms ────▶│ Read transforms
              │                         │ Signal frame ────────▶│ Interpolate
              │                         │                       │ Render
              │                         │                       │
```

### Transform Synchronization

Physics worker writes, Render worker reads:

```typescript
// Physics: Write each entity's transform
sharedBuffer.writeTransform(index, posX, posY, posZ, rotX, rotY, rotZ, rotW);

// Physics: Signal frame complete (atomic increment)
sharedBuffer.signalFrameComplete();

// Render: Check for new frame
const newFrame = sharedBuffer.getFrameCounter() !== lastFrame;

// Render: Read and interpolate
const transform = sharedBuffer.readTransform(index);
mesh.position.lerp(targetPosition, alpha);
```

## SharedArrayBuffer

### Memory Layout

```
Control Buffer (Int32Array):
┌────────────────┬─────────────┬────────────┬────────────┬─────┐
│ Frame Counter  │ Entity Count│ EntityId[0]│ EntityId[1]│ ... │
│    (atomic)    │   (atomic)  │            │            │     │
└────────────────┴─────────────┴────────────┴────────────┴─────┘
     Index 0          Index 1      Index 2      Index 3

Transform Buffer (Float32Array):
┌─────────────────────────────────────┬─────────────────────────────────────┐
│           Entity 0                  │           Entity 1                  │
│ posX posY posZ rotX rotY rotZ rotW  │ posX posY posZ rotX rotY rotZ rotW  │
└─────────────────────────────────────┴─────────────────────────────────────┘
  0    1    2    3    4    5    6       7    8    9   10   11   12   13
```

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
