# Three.js Multi-Worker Architecture

A high-performance Three.js boilerplate with physics simulation using a multi-worker architecture. Rendering and physics run in separate Web Workers for maximum performance.

## Features

- **OffscreenCanvas Rendering** - Three.js renders entirely in a Web Worker
- **Rapier Physics** - Physics simulation in a dedicated worker
- **SharedArrayBuffer** - Zero-copy transform synchronization between workers
- **Comlink RPC** - Type-safe communication between main thread and workers
- **TypeScript** - Full type safety throughout
- **Entity System** - Unified entity management across workers

## Getting Started

```bash
bun install
bun run dev
```

## Debug UI

Add `#debug` to the URL to enable Tweakpane controls and Stats.js performance monitor.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         MAIN THREAD                              │
│  App → WorkerBridge → InputManager, DebugManager, CanvasManager │
└─────────────────────────────────────────────────────────────────┘
                    │                           │
         ┌──────────┴───────────┐    ┌─────────┴──────────┐
         │   PHYSICS WORKER     │    │   RENDER WORKER    │
         │   (Rapier @ 60Hz)    │    │   (Three.js @ rAF) │
         └──────────┬───────────┘    └─────────┬──────────┘
                    │                          │
                    └────── SharedArrayBuffer ─┘
                         (Zero-copy transforms)
```

## Project Structure

```
src/
  main.ts                     # Entry point
  
  app/                        # Main thread orchestration
    index.ts                  # App orchestrator
    worker-bridge.ts          # Worker lifecycle & communication
    canvas-manager.ts         # Canvas & OffscreenCanvas transfer
    input-manager.ts          # DOM event capture
    debug-manager.ts          # Tweakpane & Stats.js
    
  renderer/                   # Three.js domain (flat)
    index.ts                  # Renderer class + createRenderApi
    time.ts                   # requestAnimationFrame loop
    resources.ts              # Asset loading
    debug.ts                  # Debug bindings
    camera.ts                 # FollowCamera controller
    input-state.ts            # Input state tracking
    config.ts                 # Renderer configuration
    sources.ts                # Asset definitions
    floor.ts                  # Ground plane
    fox.ts                    # Animated character
    plane.ts                  # Shader plane
    plane.vert                # Vertex shader
    plane.frag                # Fragment shader
    environment.ts            # Lighting & environment
    
  physics/                    # Rapier domain (flat)
    index.ts                  # PhysicsWorld + createPhysicsApi
    
  workers/                    # Thin worker entry points
    render.worker.ts          # import + Comlink.expose
    physics.worker.ts         # import + Comlink.expose
    
  shared/                     # Cross-worker contracts
    types/                    # API interfaces, entity types
    buffers/                  # SharedArrayBuffer wrappers
    utils/                    # EventEmitter
```

## Adding a New Worker

1. Create domain module: `src/audio/index.ts`
2. Create thin worker entry: `src/workers/audio.worker.ts`
3. Add API types: `src/shared/types/audio-api.ts`
4. Register in WorkerBridge

## SharedArrayBuffer Requirements

This project requires `SharedArrayBuffer` which needs specific HTTP headers:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are configured in `vite.config.ts` for both dev and preview servers.

## Browser Support

Requires:
- OffscreenCanvas (Chrome 69+, Firefox 105+, Safari 16.4+)
- SharedArrayBuffer (requires COOP/COEP headers)
- ES Modules in Workers

No fallback - shows error if unsupported.
