# CLAUDE.md

## Writing Style
ALWAYS be extremely concise. Sacrifice grammar for concision.

## Commands

- `bun run dev` - Dev server with HMR
- `bun run build` - TypeScript check + production build
- `bun run preview` - Preview production build

## Debug Mode

Add `#debug` to URL for: Tweakpane UI, Stats.js, physics collider wireframes, cube storm controls.

## Architecture

Multi-worker Three.js + Rapier physics. See `docs/architecture.md`.

### Design Principles

1. **Thin workers** - Worker files are Comlink entry points only
2. **Domain-based** - Code by function (`renderer/`, `physics/`), not location
3. **Experience/World/Renderer** - Bruno Simon pattern, dependency injection
4. **Centralized config** - `src/shared/config.ts`
5. **Explicit contracts** - `shared/` for cross-worker types only
6. **Zero-copy sync** - SharedArrayBuffer for physics→render

### Project Structure

```
src/
  main.ts                    # Entry
  
  app/                       # Main thread
    index.ts                 # App orchestrator
    coordinators/
      worker-coordinator.ts  # Worker lifecycle
      entity-coordinator.ts  # Entity orchestration
    managers/
      audio-manager.ts       # Web Audio
      input-manager.ts       # DOM events
      debug/                 # Tweakpane + Stats.js
        index.ts             # DebugManager facade
        tweakpane-manager.ts
        stats-manager.ts
    handlers/
      resize-handler.ts
      spawn-handler.ts
    bridges/
      audio-bridge.ts        # Audio→worker wiring
    routing/
      input-router.ts        # Input→workers
    providers/
      canvas-provider.ts     # OffscreenCanvas
    utils/
      load-progress-tracker.ts
    spawners/
      box-spawner.ts
      sphere-spawner.ts
      player-spawner.ts
      world-spawner.ts
    ui/
      ui-manager.ts          # UI lifecycle
    components/
      loading-screen.ts
      error-overlay.ts
      entity-spawner-ui.ts
    
  renderer/                  # Three.js (worker)
    core/
      experience.ts          # Orchestrator
      renderer.ts            # WebGLRenderer
      camera.ts              # Follow camera
    world/
      world.ts               # Entities + scene
      environment.ts         # Lighting
    entities/
      types.ts
      index.ts               # Factory + Registry
      components/            # player, ground, etc.
    objects/
      instanced-mesh-base.ts # Abstract base
      instanced-boxes.ts
      instanced-spheres.ts
      fox.ts, floor.ts
    sync/
      transform-sync.ts      # Interpolation
      physics-debug-renderer.ts
    systems/                 # time, resources, debug
    
  physics/                   # Rapier (worker)
    physics-world.ts
    floating-capsule-controller.ts
    
  workers/                   # Thin entry points
    render.worker.ts
    physics.worker.ts
    
  shared/                    # Cross-worker
    config.ts
    types/
    buffers/
    utils/
```

### Path Aliases

- `~/app` → `src/app/`
- `~/shared` → `src/shared/`
- `~/shaders` → `src/shaders/`

Domain folders use relative imports.

### Configuration

All in `src/shared/config.ts`:

```typescript
config.renderer.clearColor
config.camera.follow.distance
config.physics.gravity
config.floatingCapsule.springStrength
config.terrain.amplitude
config.entities.maxCount
```

## Key Patterns

### Adding Workers

1. Domain folder: `src/audio/index.ts`
2. Thin entry: `src/workers/audio.worker.ts`
3. API types: `src/shared/types/audio-api.ts`
4. Add to WorkerCoordinator

### Adding Scene Objects

Create in `renderer/objects/`, instantiate in `World.createSceneObjects()`.

### Adding Entity Types

Create in `renderer/entities/components/`, register in `renderer/entities/index.ts`.

Lifecycle hooks: `onTransformUpdate`, `onPhysicsFrame`, `onRenderFrame`, `dispose`.

### Entity System

```typescript
const id = createEntityId();
sharedBuffer.registerEntity(id);
await physicsApi.spawnEntity(id, transform, bodyConfig);
await renderApi.spawnEntity(id, "player");
```

### SharedArrayBuffer Sync

Physics writes transforms at 60Hz, Render interpolates. See `docs/interpolation.md`.

Requires COOP/COEP headers (configured in `vite.config.ts`, `vercel.json`).

### Floating Capsule Controller

Dynamic rigidbody with spring-damper floating. See `docs/physics.md`.

### Procedural Terrain

Seeded Simplex noise, identical in both workers:

```typescript
const heights = generateTerrainHeights(config.terrain);
const y = getHeightAt(x, z, heights, config.terrain);
```

### GPU Instancing

`InstancedBoxes`/`InstancedSpheres` extend `InstancedMeshBase`:

```typescript
mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
mesh.frustumCulled = false;  // Physics scatters instances
```

## GLSL Shaders

Co-locate with component or use `src/shaders/` for shared utilities.

## Known Issues

- **First load vibration** - Worker init race, resolves on reload
- **Movement vibration** - `setTimeout` jitter in physics. See `docs/interpolation.md`
- **InstancedMesh culling** - Must disable `frustumCulled` when physics scatters instances

## Documentation

| Doc | Content |
|-----|---------|
| `docs/architecture.md` | System design |
| `docs/entities.md` | Entity system |
| `docs/physics.md` | Floating capsule, terrain |
| `docs/interpolation.md` | Transform sync |
| `docs/gpu-context.md` | WebGPU issues (historical) |
