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

## Known Issues & Debugging History

This section documents ongoing vibration issues and attempted fixes for future reference.

### Issue: Subtle Vibration During Movement

**Symptom**: The fox character exhibits subtle vibration/jitter when moving, particularly noticeable on the player entity.

**Environment Differences**:
| Environment | Behavior |
|-------------|----------|
| Local (dev) | Smooth with constant interval, subtle vibration with actual interval |
| Deployed (Vercel) | Noticeable vibration with constant interval, similar subtle vibration with actual interval |

### Attempted Fixes

#### Attempt 1: Constant Interval (Original)

```typescript
// transform-sync.ts
const interval = timing.interval > 0 ? timing.interval : 1000 / 60;
```

**Result**: 
- Local: Smooth
- Deployed: Noticeable vibration

**Analysis**: `setTimeout` has more jitter in production (CPU contention, background tasks). When physics takes 20ms but we assume 16.67ms, alpha calculation is wrong:
- Alpha = `timeSincePhysicsFrame / 16.67` = 1.2 (clamped to 1.0)
- Object freezes, then jumps when next frame arrives

#### Attempt 2: Actual Measured Interval (Current)

```typescript
// transform-sync.ts
const actualInterval = timing.currentTime - timing.previousTime;
const interval = actualInterval > 0 ? actualInterval : 1000 / 60;
```

**Result**:
- Local: Subtle vibration introduced
- Deployed: Similar to local (improved from before, but not perfect)

**Analysis**: Using actual interval makes both environments behave similarly, but introduces subtle vibration locally. The actual interval varies frame-to-frame (14ms, 18ms, 16ms), causing alpha to be calculated against a moving target.

### Root Cause Analysis

The fundamental issue is a **timing mismatch** between:
1. When physics ACTUALLY runs (variable due to setTimeout jitter)
2. When we THINK physics runs (either constant or measured)
3. When render reads the timing data (could be mid-write)

**Possible contributing factors**:

1. **setTimeout Jitter**: `setTimeout(fn, 16.67)` doesn't guarantee 16.67ms - it's a minimum delay
2. **SharedArrayBuffer Race Condition**: Render might read timing before physics finishes writing
3. **performance.now() Precision**: Different in different contexts
4. **Camera Follow Compound Effect**: Camera following an interpolated position amplifies any jitter

### Potential Future Fixes to Explore

#### 1. Fixed Timestep Accumulator (Classic Game Loop)

Instead of `setTimeout`, use `requestAnimationFrame` with an accumulator:

```typescript
// Physics worker
let accumulator = 0;
const FIXED_DT = 1000 / 60;

function loop(timestamp) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;
  accumulator += dt;
  
  while (accumulator >= FIXED_DT) {
    stepPhysics(FIXED_DT);
    accumulator -= FIXED_DT;
  }
  
  requestAnimationFrame(loop);
}
```

**Pros**: More consistent timing, standard game dev pattern
**Cons**: Requires restructuring physics worker, may not work well in Web Worker

#### 2. Velocity-Based Extrapolation

Store velocity in the shared buffer and extrapolate when alpha > 1:

```typescript
if (alpha > 1.0) {
  // Physics is late, extrapolate using velocity
  position = current + velocity * (alpha - 1.0) * interval;
} else {
  // Normal interpolation
  position = lerp(previous, current, alpha);
}
```

**Pros**: Handles late physics frames gracefully
**Cons**: Requires velocity data, can overshoot on direction changes

#### 3. Exponential Smoothing Hybrid

Combine interpolation with exponential smoothing to dampen jitter:

```typescript
const interpolated = lerp(previous, current, alpha);
const smoothed = lerp(lastRenderedPosition, interpolated, 0.8);
```

**Pros**: Dampens high-frequency jitter
**Cons**: Adds latency, may feel sluggish

#### 4. Atomic Timing Synchronization

Ensure timing and transform writes are atomic:

```typescript
// Use a single write fence
Atomics.store(timingView, WRITE_FENCE, 0);  // Start write
writeTransforms();
writeTiming();
Atomics.store(timingView, WRITE_FENCE, 1);  // End write

// Render side: wait for fence
while (Atomics.load(timingView, WRITE_FENCE) === 0) {
  // Spin or use Atomics.wait()
}
```

**Pros**: Eliminates race conditions
**Cons**: May introduce latency, complexity

#### 5. Separate Camera Interpolation

Interpolate camera position separately with more aggressive smoothing:

```typescript
// Camera follows with extra damping
camera.position.lerp(targetPosition, 0.05); // Very smooth
```

**Pros**: Reduces perceived jitter without affecting physics accuracy
**Cons**: Camera may lag behind fast movements

### Current State

As of the last update:
- Using **actual measured interval** (`currentTime - previousTime`)
- Both local and deployed have **similar subtle vibration**
- This is a trade-off: consistent behavior across environments vs perfect local smoothness

### Testing Checklist

When testing interpolation changes:

1. [ ] Test locally at 60Hz display
2. [ ] Test locally at 120Hz+ display
3. [ ] Test with CPU throttling (Chrome DevTools > Performance > CPU 4x slowdown)
4. [ ] Deploy to Vercel and test
5. [ ] Test with many physics objects (spawn 500 cubes)
6. [ ] Test camera following vs stationary camera
7. [ ] Test on mobile devices

---

## References

- [Fix Your Timestep! - Glenn Fiedler](https://gafferongames.com/post/fix_your_timestep/)
- [Snapshot Interpolation - Glenn Fiedler](https://gafferongames.com/post/snapshot_interpolation/)
- [Game Loop - Game Programming Patterns](https://gameprogrammingpatterns.com/game-loop.html)
- [Unity Rigidbody Interpolation](https://docs.unity3d.com/Manual/rigidbody-interpolation.html)
