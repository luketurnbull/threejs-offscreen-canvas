# CLAUDE.md

## Writing Style
ALWAYS be extremely concise. Sacrifice grammar for concision.

## Commands

- `bun run dev` - Dev server with HMR
- `bun run build` - TypeScript check + production build
- `bun run preview` - Preview production build

## Debug Mode

Add `#debug` to URL for: Tweakpane UI, Stats.js, physics collider wireframes, entity spawning.

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
      audio-manager.ts       # Web Audio API
      input-manager.ts       # DOM events
      debug/                 # Tweakpane + Stats.js
        index.ts             # DebugManager facade
        tweakpane-manager.ts
        stats-manager.ts
    handlers/
      resize-handler.ts
      spawn-handler.ts
    bridges/
      audio-bridge.ts        # Audio↔worker wiring
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
      entity-spawner-ui.ts   # Shape/size selector + 3D preview
      keyboard-controls-ui.ts # WASD/Space overlay
    
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
      components/            # player, ground, static-mesh
    objects/
      instanced-mesh-base.ts # Abstract base
      instanced-boxes.ts
      instanced-spheres.ts
      fox.ts, floor.ts
    sync/
      transform-sync.ts      # Interpolation
      physics-debug-renderer.ts
    systems/                 # time, resources, debug, input-state, ground-raycaster
    
  physics/                   # Rapier (worker)
    physics-world.ts
    floating-capsule-controller.ts
    
  workers/                   # Thin entry points
    render.worker.ts
    physics.worker.ts
    
  shared/                    # Cross-worker
    config.ts
    debug-config.ts          # Debug update types
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
// Renderer
config.renderer.clearColor           // "#ffffff"
config.renderer.toneMappingExposure  // 1.75

// Camera
config.camera.follow.distance        // 10
config.camera.follow.height          // 4

// Physics
config.physics.gravity               // { x: 0, y: -20, z: 0 }
config.physics.density               // 1.0 (mass = density × volume)

// Floating Capsule
config.floatingCapsule.springStrength    // 1.2
config.floatingCapsule.jumpForce         // 12
config.floatingCapsule.sprintMultiplier  // 1.8

// Terrain
config.terrain.amplitude             // 5
config.terrain.octaves               // 5

// Audio
config.audio.footsteps.volume        // 0.4
config.audio.collisions.minImpulse   // 4.0
config.audio.spatial.refDistance     // 5

// Spawner
config.spawner.projectileSpeed       // 20
config.spawner.minSize               // 0.3
config.spawner.maxSize               // 3.0
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

### Audio System

Main thread AudioManager with spatial audio. See `docs/audio.md`.

- Footsteps from player animation events
- Collision sounds from physics events via AudioBridge
- Jump/land from player state callbacks
- Spatial positioning from camera listener

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
| `docs/audio.md` | Spatial audio system |
| `docs/gpu-context.md` | WebGPU issues (historical) |
