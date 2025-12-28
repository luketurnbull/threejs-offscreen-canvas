# Physics

Rapier in Web Worker, 60Hz fixed timestep, zero-copy transform sync.

```
Physics Worker ═══ SharedArrayBuffer ═══> Render Worker
   Rapier              Transforms          TransformSync
   60Hz                + Timing            Interpolation
```

## Floating Capsule Controller

Dynamic rigidbody with spring-damper, not kinematic.

```
    ┌──────────┐
    │  Capsule │  ← Dynamic rigidbody
    └────┬─────┘
         │
    Spring-Damper  ← Floating force
         │
────────────────── Ground
```

### Forces

1. **Floating**: `springForce = k * (target - current) - damping * velocityY`
2. **Movement**: Impulses toward target velocity
3. **Jump**: Impulse with coyote time + input buffer

### Config

```typescript
floatingCapsule: {
  // Capsule dimensions
  radius: 0.35,
  halfHeight: 0.25,

  // Floating spring-damper
  floatingDistance: 0.3,
  rayLength: 0.8,
  springStrength: 1.2,
  springDamping: 0.08,

  // Movement
  moveForce: 30,
  sprintMultiplier: 1.8,
  airControlMultiplier: 0.3,
  maxVelocity: 8,
  sprintMaxVelocity: 14,

  // Jump
  jumpForce: 12,
  coyoteTime: 150,      // ms
  jumpBufferTime: 100,  // ms

  // Ground detection
  groundedThreshold: 0.05,
  slopeLimit: 50,       // degrees

  // Physics properties
  mass: 1,
  friction: 0.0,
  linearDamping: 0.5,
  angularDamping: 1.0,
}
```

### Tuning

| Param | ↑ | ↓ |
|-------|---|---|
| springStrength | Snappier | Floatier |
| springDamping | Less bouncy | More bouncy |
| moveForce | Fast accel | Slow start |
| jumpForce | Higher | Lower |
| sprintMultiplier | Faster sprint | Slower sprint |
| airControlMultiplier | More air control | Less air control |

### vs Kinematic

| | Kinematic | Floating Capsule |
|-|-----------|------------------|
| Push objects | Manual | Automatic |
| Get pushed | Manual | Automatic |
| Game feel | Rigid | Smooth |

## Procedural Terrain

Heightfield with seeded Simplex noise, identical in both workers.

```typescript
const heights = generateTerrainHeights(config.terrain);
const y = getHeightAt(x, z, heights, config.terrain);
```

### Config

```typescript
terrain: {
  size: 100,          // World units
  segments: 128,      // Grid resolution
  noiseScale: 0.015,  // Frequency (lower = larger hills)
  amplitude: 5,       // Max height variation
  octaves: 5,         // Detail layers
  persistence: 0.45,  // Amplitude falloff per octave
  seed: 42,           // Deterministic seed
}
```

## Colliders

| Type | Performance | Use |
|------|-------------|-----|
| Cuboid | Fastest | Boxes |
| Capsule | Fast | Characters |
| Ball | Fast | Spheres |
| Heightfield | Medium | Terrain |

## Debug Visualization

Enable: `#debug` URL → Physics folder → "Show Colliders".

## Input Flow

```
Main Thread           Physics Worker
setPlayerInput() ───> FloatingCapsuleController.update()
                      ├── detectGround()
                      ├── applyFloatingForce()
                      ├── applyMovementForces()
                      └── handleJump()
```

## Files

```
src/physics/
  physics-world.ts
  floating-capsule-controller.ts

src/shared/utils/
  noise.ts
  terrain.ts
```
