# Audio System

This document explains the audio system architecture and how to add new sound effects.

## Overview

The audio system provides spatial 3D audio for the multi-worker Three.js application, supporting:
- **Footstep sounds** - triggered by player movement
- **Collision sounds** - triggered by physics object impacts  
- **Jump/Land sounds** - triggered by player state changes
- **Spatial audio** - 3D positioned sounds synced with camera

## Architecture

```
                              MAIN THREAD
    +------------------------------------------------------------------+
    |   App                                                            |
    |    +-- WorkerBridge                                              |
    |    +-- AudioManager                                              |
    |           +-- AudioContext (Web Audio API)                       |
    |           +-- THREE.AudioListener                                |
    |           +-- Sound pools (footsteps, impacts)                   |
    +------------------------------------------------------------------+
                    ^                         ^
         Collision/Jump/Land       Footstep/Listener Events
         (Comlink callback)        (Comlink callback)
                    |                         |
    +---------------+-------+     +-----------+-----------+
    |   PHYSICS WORKER      |     |   RENDER WORKER       |
    |   - drainCollisionEvents   |   - PlayerEntity       |
    |   - FloatingCapsule   |     |     footstep timing   |
    |     jump/land detect  |     |   - Camera position   |
    +-----------------------+     +-----------------------+
```

### Why Main Thread?

**AudioContext cannot be created in a Web Worker.** This is a fundamental browser limitation. The audio system must live on the main thread and receive events from workers via Comlink callbacks.

## Event Flow

### Footsteps

```
PlayerEntity.onPhysicsFrame()
    │
    │ (movement input + timing check)
    ▼
footstepCallback (Comlink proxy)
    │
    ▼
WorkerBridge → AudioManager.onFootstep()
    │
    ▼
SoundPool.play(playerPosition)
```

Footsteps are triggered based on:
- Whether player is moving (WASD keys)
- Timing interval (walk: 400ms, run: 250ms)
- Movement intensity (walk: 0.6, run: 1.0)

### Collisions

```
PhysicsWorld.step()
    │
    ▼
world.step(eventQueue)
    │
    ▼
drainCollisionEvents()
    │
    │ (filter by impulse threshold)
    ▼
collisionCallback (Comlink proxy)
    │
    ▼
WorkerBridge → AudioManager.onCollision()
    │
    ▼
SoundPool.play(collisionPosition, { volume: impulse })
```

Collisions are filtered by:
- Minimum impulse threshold (config.audio.collisions.minImpulse)
- Cooldown per entity pair (100ms)
- Player collisions are excluded (player has its own audio)

### Jump/Land

```
FloatingCapsuleController.update()
    │
    ▼
detectGround() → isGrounded state
    │
    │ (state change detection)
    ▼
emitJumpEvent() / emitLandEvent()
    │
    ▼
playerStateCallback (Comlink proxy)
    │
    ▼
WorkerBridge → AudioManager.onJump() / onLand()
```

### Listener Sync

```
Experience.update()
    │
    ▼
Camera.update()
    │
    ▼
emitListenerUpdate({ position, forward, up })
    │
    ▼
listenerCallback (Comlink proxy)
    │
    ▼
WorkerBridge → AudioManager.updateListener()
```

The listener position syncs every frame for accurate spatial audio positioning.

## Configuration

All audio settings are in `src/shared/config.ts`:

```typescript
audio: {
  master: {
    volume: 1.0,
  },
  footsteps: {
    volume: 0.4,
    walkInterval: 400,  // ms between steps when walking
    runInterval: 250,   // ms between steps when running
    poolSize: 4,        // reusable audio sources
  },
  collisions: {
    volume: 0.6,
    minImpulse: 0.5,    // minimum collision strength
    poolSize: 8,
  },
  player: {
    jumpVolume: 0.5,
    landVolume: 0.6,
    landIntensityThreshold: 2.0,  // fall speed for max volume
  },
  spatial: {
    refDistance: 5,     // distance at which volume is full
    maxDistance: 50,    // distance beyond which sound is inaudible
    rolloffFactor: 1,
  },
}
```

## Audio Assets

Place audio files in `public/audio/`:

```
public/audio/
  footstep_01.ogg
  footstep_02.ogg
  footstep_03.ogg
  impact_01.ogg
  impact_02.ogg
  jump.ogg
  land.ogg
```

The AudioManager loads these on initialization. Multiple files for the same sound type (e.g., footstep_01, footstep_02) are randomly selected for variation.

## Adding New Sound Effects

### 1. Add Audio Files

Place your `.ogg` files in `public/audio/`.

### 2. Update AudioManager

Add the new sound to the asset loading in `src/app/audio-manager.ts`:

```typescript
private async loadAssets(): Promise<void> {
  const assetGroups = [
    // ... existing assets
    {
      name: "my_new_sound",
      paths: ["audio/my_sound_01.ogg", "audio/my_sound_02.ogg"],
    },
  ];
  // ...
}
```

### 3. Create Event Type (if needed)

If you need a new event type, add it to `src/shared/types/audio-events.ts`:

```typescript
export interface MyNewEvent {
  type: "my_new_sound";
  entityId: EntityId;
  position: { x: number; y: number; z: number };
  // ... additional properties
}
```

### 4. Add Handler Method

Add a handler in AudioManager:

```typescript
onMyNewSound(event: MyNewEvent): void {
  if (!this.canPlay() || !this.myNewSoundPool) return;
  
  this.myNewSoundPool.play(event.position, {
    volume: event.intensity,
  });
}
```

### 5. Wire Up Callback

In `WorkerBridge.setupAudioCallbacks()`, add the new callback:

```typescript
someWorkerApi.setMyNewSoundCallback(
  Comlink.proxy((event: MyNewEvent) => {
    this.audioManager.onMyNewSound(event);
  }),
);
```

## Sound Pooling

The `SoundPool` class manages reusable `THREE.PositionalAudio` instances to prevent garbage collection stalls:

```typescript
const pool = new SoundPool(listener, scene, {
  poolSize: 4,
  volume: 0.5,
  refDistance: 5,
  maxDistance: 50,
  rolloffFactor: 1,
});

pool.setBuffers([buffer1, buffer2, buffer3]);  // Random selection
pool.play(position, { volume: 0.8, playbackRate: 1.1 });
```

Features:
- Round-robin allocation of audio sources
- Random buffer selection for variation
- Automatic slight pitch variation (0.95-1.05)
- Spatial audio with configurable rolloff

## Browser Autoplay Policy

Browsers require user interaction before playing audio. The WorkerBridge automatically handles this:

```typescript
private setupAudioResume(): void {
  const resumeAudio = async () => {
    await this.audioManager.resume();
    document.removeEventListener("click", resumeAudio);
    document.removeEventListener("keydown", resumeAudio);
  };

  document.addEventListener("click", resumeAudio, { once: true });
  document.addEventListener("keydown", resumeAudio, { once: true });
}
```

Audio will begin playing after the first click or keypress.

## File Structure

```
src/
  app/
    audio-manager.ts          # Main thread audio orchestrator
    worker-bridge.ts          # Audio callback integration
    
  audio/
    index.ts                  # Re-exports
    sound-pool.ts             # Pooled PositionalAudio instances
    
  shared/
    types/
      audio-events.ts         # Event interfaces
    config.ts                 # Audio configuration
    
  physics/
    physics-world.ts          # Collision event draining
    floating-capsule-controller.ts  # Jump/land detection
    
  renderer/
    core/experience.ts        # Listener sync
    entities/components/player.ts   # Footstep emission
```

## Debugging

1. Check browser console for audio loading errors
2. Verify AudioContext state: `audioManager.context.state`
3. Test with `#debug` URL to see entity positions
4. Add console logs in audio event handlers

Common issues:
- **No sound**: Check that audio files exist in `public/audio/`
- **Sounds don't play initially**: Browser autoplay policy - click/press key first
- **Spatial audio wrong**: Verify listener position is being updated
