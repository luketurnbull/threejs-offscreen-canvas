# Physics-Render Interpolation

This document explains how transform interpolation works between the Physics and Render workers to achieve smooth, jitter-free motion.

## The Problem

When physics and rendering run at different rates, objects can appear to vibrate or stutter:

- **Physics**: Fixed 60Hz (16.67ms via `setTimeout`)
- **Rendering**: Variable Hz (display refresh rate via `requestAnimationFrame`)

### Naive Approach (Failed)

The initial implementation stored one physics transform and interpolated from the "current rendered position" to the "physics target":

```typescript
// When new physics frame arrives:
previousPosition = object.position; // Current rendered position
targetPosition = physicsPosition;   // New physics target
lastUpdateTime = now;

// Each render frame:
alpha = (now - lastUpdateTime) / physicsInterval;
object.position.lerp(previousPosition, targetPosition, alpha);
```

**Problem**: When a new physics frame arrives, `lastUpdateTime` resets, causing alpha to jump backward:

```
T=8ms:     alpha = 0.48 (interpolating toward target)
T=16.67ms: new physics frame, reset lastUpdateTime
T=20ms:    alpha = 0.20 (SUDDEN JUMP BACKWARD!)
```

This discontinuity causes visible vibration.

## The Solution: Timestamp-Based Interpolation

Based on Glenn Fiedler's ["Fix Your Timestep!"](https://gafferongames.com/post/fix_your_timestep/) article, adapted for multi-worker architecture.

### Key Insight

Store **two physics frames** (previous and current) along with **timestamps**. The render worker interpolates between the two known physics states using timing information.

### Architecture

```
Physics Worker                          Render Worker
──────────────                          ─────────────
                                        
Step physics                            Read timing
   │                                       │
   ▼                                       ▼
Write transforms                        Calculate alpha
(current → previous,                    alpha = (renderTime - physicsTime) / interval
 new → current)                            │
   │                                       ▼
   ▼                                    Interpolate
Write timing                            lerp(previous, current, alpha)
(currentTime, interval)                    │
   │                                       ▼
   ▼                                    Render
Signal frame complete                   
```

### SharedArrayBuffer Layout

```
Control Buffer (Int32Array):
┌────────────────┬─────────────┬────────────┬─────┐
│ Frame Counter  │ Entity Count│ EntityId[0]│ ... │
└────────────────┴─────────────┴────────────┴─────┘

Timing Buffer (Float64Array):
┌─────────────────────┬─────────────────────┬──────────────────┐
│ Current Frame Time  │ Previous Frame Time │ Physics Interval │
│     (Float64)       │      (Float64)      │    (Float64)     │
└─────────────────────┴─────────────────────┴──────────────────┘

Transform Buffer (Float32Array) - 14 floats per entity:
┌──────────────────────────────────────────────────────────────┐
│ Entity 0 CURRENT:  posX posY posZ rotX rotY rotZ rotW        │
│ Entity 0 PREVIOUS: posX posY posZ rotX rotY rotZ rotW        │
│ Entity 1 CURRENT:  ...                                       │
│ Entity 1 PREVIOUS: ...                                       │
└──────────────────────────────────────────────────────────────┘
```

### Alpha Calculation

```typescript
// Read timing from physics worker
const timing = sharedBuffer.readFrameTiming();

// Calculate how far we are between physics frames
const timeSincePhysicsFrame = performance.now() - timing.currentTime;
const alpha = clamp(timeSincePhysicsFrame / timing.interval, 0, 1);

// Interpolate between two known physics states
position = lerp(previous, current, alpha);
```

### Why This Works

1. **Alpha smoothly increases** from 0 to 1 between physics frames
2. **No discontinuity** when new physics frames arrive - we just get a new prev/current pair
3. **Self-correcting**: if physics is slow, alpha clamps at 1.0
4. **Uses actual physics timing**, not wall-clock assumptions

### Timing Diagram

```
Time    Physics Worker              Render Worker
────────────────────────────────────────────────────────
0ms     Write transforms            
        Write timing (t=0)          
        Signal frame N              

8ms                                 Read timing (t=0)
                                    alpha = 8/16.67 = 0.48
                                    Render (lerp prev→cur, 0.48)

16ms    Write transforms            
        Write timing (t=16)         
        Signal frame N+1            

20ms                                Read timing (t=16)
                                    alpha = 4/16.67 = 0.24
                                    Render (lerp prev→cur, 0.24)
                                    ↑ New prev/cur pair, smooth!
```

## Alternative Approaches Considered

### Exponential Smoothing

```typescript
position = lerp(position, target, 0.25);
```

**Pros**: Simple, always converges
**Cons**: Introduces latency, doesn't use physics timing info, can feel sluggish

### Predictive Extrapolation

```typescript
position = current + velocity * timeSinceUpdate;
```

**Pros**: Can reduce perceived latency
**Cons**: Overshoots on direction changes, requires velocity data, objects can phase through walls

### Hermite Interpolation

Uses position + velocity at both endpoints for smoother curves.

**Pros**: Smoother curves for fast-moving objects
**Cons**: More complex, requires velocity data, overkill for 60Hz physics

## Implementation Files

| File | Purpose |
|------|---------|
| `src/shared/buffers/transform-buffer.ts` | SharedArrayBuffer management, timing + double transforms |
| `src/physics/index.ts` | Writes transforms + timing after each physics step |
| `src/renderer/index.ts` | Reads transforms, calculates alpha, interpolates |
| `src/shared/types/physics-api.ts` | SharedBuffers interface with timing buffer |

## Testing

1. Run with `#debug` URL hash to see FPS meter
2. Move fox with WASD - motion should be smooth
3. Test at different display refresh rates (60Hz, 120Hz, 144Hz)
4. Test with CPU throttling to simulate slow physics

## References

- [Fix Your Timestep! - Glenn Fiedler](https://gafferongames.com/post/fix_your_timestep/)
- [Snapshot Interpolation - Glenn Fiedler](https://gafferongames.com/post/snapshot_interpolation/)
- [Game Loop - Game Programming Patterns](https://gameprogrammingpatterns.com/game-loop.html)
- [Unity Rigidbody Interpolation](https://docs.unity3d.com/Manual/rigidbody-interpolation.html)
