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
  radius: 0.35,
  halfHeight: 0.25,
  floatingDistance: 0.3,
  rayLength: 0.8,
  springStrength: 1.2,
  springDamping: 0.08,
  moveForce: 30,
  maxVelocity: 8,
  jumpForce: 8,
  coyoteTime: 150,  // ms
}
```

### Tuning

| Param | ↑ | ↓ |
|-------|---|---|
| springStrength | Snappier | Floatier |
| springDamping | Less bouncy | More bouncy |
| moveForce | Fast accel | Slow start |
| jumpForce | Higher | Lower |

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
  size: 100,
  segments: 128,
  noiseScale: 0.02,
  amplitude: 2.5,
  octaves: 4,
  seed: 42,
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
