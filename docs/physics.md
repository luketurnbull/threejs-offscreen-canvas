# Physics

Physics simulation using Rapier in a dedicated Web Worker with zero-copy transform synchronization.

## Overview

The physics system runs in a separate worker at a fixed 60Hz timestep, while the render worker interpolates transforms for smooth visuals at display refresh rate.

```
┌─────────────────┐     SharedArrayBuffer     ┌─────────────────┐
│  Physics Worker │ ═══════════════════════>  │  Render Worker  │
│                 │                           │                 │
│  Rapier World   │   Transforms + Timing     │  TransformSync  │
│  60Hz fixed     │                           │  Interpolation  │
└─────────────────┘                           └─────────────────┘
```

## Floating Capsule Controller

The player uses a **dynamic rigidbody-based floating capsule controller** instead of a traditional kinematic character controller. This approach is inspired by:
- [Toyful Games' Very Very Valet](https://www.toyfulgames.com/)
- [pmndrs/ecctrl](https://github.com/pmndrs/ecctrl)

### Key Concepts

```
         ┌──────────┐
         │  Capsule │  ← Dynamic rigidbody (not kinematic)
         │  (body)  │
         └────┬─────┘
              │
         Spring-Damper  ← Floating force keeps character hovering
              │
    ──────────┴──────────  Ground (heightfield terrain)
```

### 1. Floating Force (Spring-Damper)

The character hovers above the ground using a spring-damper system:

```typescript
// Spring force pushes up when below target, pulls down when above
springForce = springK * (targetDistance - currentDistance)

// Damping resists velocity to prevent oscillation  
dampingForce = -dampingC * velocityY

// Combined floating force
floatingForce = springForce + dampingForce
```

### 2. Movement Forces (Impulse-Based)

Movement is applied as impulses toward a target velocity:

```typescript
// Calculate acceleration needed to reach target velocity
acceleration = targetVelocity - currentVelocity

// Apply as force: F = m * a
force = mass * acceleration * tuningFactor
```

### 3. Jump with Coyote Time

Jump uses impulses with game-feel features:

```typescript
// Coyote time: grace period after leaving ground
if (timeSinceGrounded < coyoteTime) {
  canJump = true;
}

// Jump buffer: remember jump input before landing
if (jumpPressed && !grounded) {
  bufferJump();
}
```

### Configuration

All floating capsule settings in `src/shared/config.ts`:

```typescript
floatingCapsule: {
  // Capsule dimensions
  radius: 0.35,
  halfHeight: 0.25,

  // Floating spring-damper system
  floatingDistance: 0.3,   // Target hover distance
  rayLength: 0.8,          // Ground detection ray
  springStrength: 1.2,     // Spring constant (higher = snappier)
  springDamping: 0.08,     // Damping (higher = less bouncy)

  // Movement forces
  moveForce: 30,           // Base movement force
  sprintMultiplier: 1.8,   // Sprint force multiplier
  airControlMultiplier: 0.3, // Reduced air control
  maxVelocity: 8,          // Max horizontal speed

  // Jump
  jumpForce: 8,            // Jump impulse
  coyoteTime: 150,         // ms grace period
  jumpBufferTime: 100,     // ms input buffer

  // Ground detection
  groundedThreshold: 0.05,
  slopeLimit: 50,          // Max slope in degrees

  // Physics properties
  mass: 1,
  friction: 0.0,           // Low for smooth sliding
  linearDamping: 0.5,      // Air resistance
  angularDamping: 1.0,     // Prevent spinning
}
```

### Tuning Guide

| Parameter | Increase | Decrease |
|-----------|----------|----------|
| `springStrength` | Snappier hover | Floatier feel |
| `springDamping` | Less bouncy | More bouncy |
| `moveForce` | Faster acceleration | Slower start |
| `maxVelocity` | Higher top speed | Slower running |
| `jumpForce` | Higher jumps | Lower jumps |
| `airControlMultiplier` | More air control | Less air control |
| `coyoteTime` | More forgiving | More precise |

### Why Floating Capsule?

Compared to kinematic character controllers:

| Feature | Kinematic | Floating Capsule |
|---------|-----------|------------------|
| Physics interactions | Manual | Automatic |
| Push objects | Requires code | Natural |
| Get pushed | Requires code | Natural |
| Slopes | Auto-step | Spring handles |
| Stairs | Auto-step | Needs tuning |
| Game feel | Rigid | Smooth |

## Procedural Terrain (Heightfield)

The ground uses a Rapier heightfield collider with procedural Simplex noise for organic hills.

### How It Works

Both physics and render workers generate identical terrain using seeded deterministic noise:

```
┌─────────────────┐                    ┌─────────────────┐
│  Physics Worker │                    │  Render Worker  │
│                 │                    │                 │
│  Same seed (42) │                    │  Same seed (42) │
│       ↓         │                    │       ↓         │
│  SimplexNoise   │   Identical!       │  SimplexNoise   │
│       ↓         │  ════════════      │       ↓         │
│  Heightfield    │                    │  Vertex Displace│
│  Collider       │                    │  PlaneGeometry  │
└─────────────────┘                    └─────────────────┘
```

### Terrain Configuration

```typescript
terrain: {
  size: 100,           // World units (X and Z)
  segments: 128,       // Grid resolution (128x128)
  noiseScale: 0.02,    // Frequency (lower = larger hills)
  amplitude: 2.5,      // Max height variation
  octaves: 4,          // Detail layers (fbm)
  persistence: 0.5,    // Amplitude falloff per octave
  seed: 42,            // Deterministic seed
}
```

### Noise Utilities

Located in `src/shared/utils/`:

```typescript
// noise.ts - Seeded 2D Simplex noise
const noise = new SimplexNoise(seed);
const value = noise.noise2D(x, y);        // Returns [-1, 1]
const detail = noise.fbm(x, y, 4, 0.5);   // Fractal brownian motion

// terrain.ts - Height generation
const heights = generateTerrainHeights(config.terrain);
const y = getHeightAt(x, z, heights, config.terrain);
```

## Collider Types

| Type | Method | Performance | Use Case |
|------|--------|-------------|----------|
| Cuboid | `ColliderDesc.cuboid(hx, hy, hz)` | Fastest | Boxes, crates |
| Capsule | `ColliderDesc.capsule(halfHeight, radius)` | Fast | Characters |
| Ball | `ColliderDesc.ball(radius)` | Fast | Spheres |
| Heightfield | `ColliderDesc.heightfield(rows, cols, heights, scale)` | Medium | Terrain |
| Trimesh | `ColliderDesc.trimesh(vertices, indices)` | Slow | Static geometry |

## Debug Visualization

Physics colliders can be visualized as green wireframes in debug mode.

### Enabling

1. Add `#debug` to URL: `http://localhost:5173/#debug`
2. In Tweakpane UI, find "Physics" folder
3. Toggle "Show Colliders"

### Supported Debug Shapes

```typescript
type DebugColliderShape =
  | { type: "cuboid"; halfExtents: { x; y; z } }
  | { type: "capsule"; radius; halfHeight }
  | { type: "ball"; radius };
```

## Input Flow

```
Main Thread                Physics Worker
     │                          │
     │  setPlayerInput({        │
     │    forward: true,        │
     │    jump: true,           │
     │  })                      │
     │ ────────────────────────>│
     │                          │ FloatingCapsuleController.update()
     │                          │   - detectGround() via raycast
     │                          │   - applyFloatingForce()
     │                          │   - applyMovementForces()
     │                          │   - handleJump()
     │                          │ Write transform to SharedArrayBuffer
```

## File Structure

```
src/physics/
  index.ts                      # Module exports
  physics-world.ts              # Rapier world management
  floating-capsule-controller.ts # Player controller

src/shared/utils/
  noise.ts                      # Seeded Simplex noise
  terrain.ts                    # Height generation
```

## References

- [Rapier Documentation](https://rapier.rs/docs/)
- [Toyful Games - Very Very Valet Physics](https://www.toyfulgames.com/)
- [pmndrs/ecctrl - React Three Fiber Character Controller](https://github.com/pmndrs/ecctrl)
