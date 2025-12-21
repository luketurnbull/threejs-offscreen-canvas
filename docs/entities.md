# Entity System

This document explains the entity component system used for managing renderable objects in the Three.js renderer.

## Overview

The entity system provides a composable, extensible way to add new entity types without modifying the core Renderer class. It follows a **factory + registry pattern** where:

- **RenderComponent** defines the interface all entities must implement
- **EntityFactory** creates entities from type strings
- **EntityRegistry** maps type names to factory functions

```
┌─────────────────────────────────────────────────────────────┐
│                     EntityRegistry                           │
│  ┌──────────┬──────────────────────────────────────────┐    │
│  │  "player" │ → createPlayerEntity()                   │    │
│  │  "ground" │ → createGroundEntity()                   │    │
│  │  "static" │ → createStaticMeshEntity()               │    │
│  └──────────┴──────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                     EntityFactory                            │
│                                                              │
│   create(id, "player", data) ────▶ PlayerEntity             │
│   create(id, "ground", data) ────▶ GroundEntity             │
│   create(id, "unknown", data) ───▶ StaticMeshEntity (red)   │
└─────────────────────────────────────────────────────────────┘
```

## Main Thread Entity Coordination

On the main thread, entities are managed by the **EntityCoordinator** which orchestrates specialized sub-spawners:

```
┌─────────────────────────────────────────────────────────────┐
│                   EntityCoordinator                          │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ WorldSpawner │  │PlayerSpawner│  │ BoxSpawner/Sphere │  │
│  │   (ground)   │  │  (player)   │  │  (instanced)       │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           │
           ┌───────────────┼───────────────┐
           ▼               ▼               ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ PhysicsApi│    │ RenderApi │    │SharedBuffer│
    └──────────┘    └──────────┘    └──────────┘
```

### Sub-Spawners

| Spawner | Purpose | Entity Type |
|---------|---------|-------------|
| `WorldSpawner` | Ground/terrain | Heightfield physics + "ground" entity |
| `PlayerSpawner` | Player character | Floating capsule + "player" entity |
| `BoxSpawner` | Dynamic boxes | Batch physics + InstancedMesh |
| `SphereSpawner` | Dynamic spheres | Batch physics + InstancedMesh |

### Instanced Entities (High Performance)

Boxes and spheres use **InstancedMesh** for maximum performance:

```typescript
// Single draw call for all boxes
const boxSpawner = new BoxSpawner(physicsApi, renderApi, sharedBuffer);

// Spawn 500 boxes in one batch
await boxSpawner.spawnBatch([
  { position: { x: 0, y: 5, z: 0 } },
  { position: { x: 1, y: 5, z: 0 }, size: { x: 1.5, y: 1.5, z: 1.5 } },
  // ... 498 more
]);
```

Benefits:
- **1 draw call** for all boxes (vs N draw calls)
- **O(1) removal** via swap-with-last pattern
- **Per-instance scales** for different sizes
- **GPU instancing** for transforms

## Directory Structure

```
src/
├── app/
│   └── entities/                   # Main thread entity coordination
│       ├── index.ts                # EntityCoordinator
│       ├── types.ts                # Spawn command types
│       └── spawners/
│           ├── world-spawner.ts    # Ground/terrain
│           ├── player-spawner.ts   # Player character
│           ├── box-spawner.ts      # Dynamic boxes (instanced)
│           └── sphere-spawner.ts   # Dynamic spheres (instanced)
│
└── renderer/
    ├── index.ts                    # Experience (uses EntityFactory)
    ├── entities/
    │   ├── types.ts                # RenderComponent, EntityContext interfaces
    │   ├── index.ts                # EntityFactory + EntityRegistry
    │   └── components/
    │       ├── player.ts           # PlayerEntity (fox + animations)
    │       ├── ground.ts           # GroundEntity (invisible physics proxy)
    │       └── static-mesh.ts      # Generic fallback entity
    └── objects/                    # Pure visual components (no entity logic)
        ├── fox.ts                  # Animated fox model
        ├── floor.ts                # Ground plane mesh
        ├── instanced-boxes.ts      # InstancedMesh for boxes
        ├── instanced-spheres.ts    # InstancedMesh for spheres
        └── plane.ts                # Shader plane
```

## Core Interfaces

### RenderComponent

The interface all entities must implement:

```typescript
interface RenderComponent {
  // Identity
  readonly id: EntityId;
  readonly type: string;
  
  // Three.js scene graph node
  readonly object: THREE.Object3D;
  
  // Optional animation mixer (for animated entities)
  readonly mixer?: THREE.AnimationMixer;
  
  // Lifecycle Hooks (all optional)
  onTransformUpdate?(position: THREE.Vector3, quaternion: THREE.Quaternion): void;
  onPhysicsFrame?(inputState: InputState): void;
  onRenderFrame?(delta: number, elapsed: number): void;
  
  // Cleanup
  dispose(): void;
}
```

### Lifecycle Hooks

| Hook | When Called | Use Case |
|------|-------------|----------|
| `onTransformUpdate` | After interpolated transform is applied | Custom transform logic, particles at position |
| `onPhysicsFrame` | When new physics data arrives | Animation state changes based on input |
| `onRenderFrame` | Every render frame | Shader uniforms, time-based effects |
| `dispose` | When entity is removed | Clean up geometry, materials, subscriptions |

### EntityContext

Shared dependencies passed to entity factories:

```typescript
interface EntityContext {
  scene: THREE.Scene;
  resources: Resources;
  time: Time;
  debug: Debug;
  inputState: InputState;
}
```

## Built-in Entity Types

### PlayerEntity

Wraps the Fox model with animation state management:

```typescript
class PlayerEntity implements RenderComponent {
  readonly type = "player";
  readonly mixer: THREE.AnimationMixer;
  
  private fox: Fox;
  
  onPhysicsFrame(inputState: InputState): void {
    const isMoving = inputState.isKeyDown("w") || inputState.isKeyDown("s");
    const isRunning = inputState.isKeyDown("shift");
    
    if (isMoving) {
      this.fox.play(isRunning ? "running" : "walking");
    } else {
      this.fox.play("idle");
    }
  }
}
```

### GroundEntity

Invisible entity used as a physics proxy. Has no visual representation but participates in transform synchronization:

```typescript
class GroundEntity implements RenderComponent {
  readonly type = "ground";
  readonly object: THREE.Object3D;  // Empty Object3D
  
  // No visual mesh - physics only
}
```

### StaticMeshEntity

Fallback for unknown entity types. Creates a colored cube:

```typescript
const entity = await entityFactory.create(id, "unknown-type");
// Creates a red cube as a visual indicator
```

## Adding New Entity Types

### Step 1: Create the Component

```typescript
// src/renderer/entities/components/tree.ts
import * as THREE from "three";
import type { EntityId } from "~/shared/types";
import type { RenderComponent, EntityContext } from "../types";

export class TreeEntity implements RenderComponent {
  readonly id: EntityId;
  readonly type = "tree";
  readonly object: THREE.Object3D;
  
  private leaves: THREE.Mesh;
  
  constructor(id: EntityId, context: EntityContext, data?: Record<string, unknown>) {
    this.id = id;
    
    // Create tree mesh
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.3, 2),
      new THREE.MeshStandardMaterial({ color: 0x8B4513 })
    );
    
    this.leaves = new THREE.Mesh(
      new THREE.ConeGeometry(1, 2, 8),
      new THREE.MeshStandardMaterial({ color: 0x228B22 })
    );
    this.leaves.position.y = 2;
    
    this.object = new THREE.Group();
    this.object.add(trunk);
    this.object.add(this.leaves);
    
    context.scene.add(this.object);
  }
  
  // Optional: Sway in the wind
  onRenderFrame(delta: number, elapsed: number): void {
    this.leaves.rotation.z = Math.sin(elapsed * 0.001) * 0.05;
  }
  
  dispose(): void {
    this.object.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        (child.material as THREE.Material).dispose();
      }
    });
    this.object.parent?.remove(this.object);
  }
}

export function createTreeEntity(
  id: EntityId,
  context: EntityContext,
  data?: Record<string, unknown>
): RenderComponent {
  return new TreeEntity(id, context, data);
}
```

### Step 2: Register in the Registry

```typescript
// src/renderer/entities/index.ts
import { createTreeEntity } from "./components/tree";

// Add to existing registrations
entityRegistry.register("tree", createTreeEntity);
```

### Step 3: Spawn from Main Thread

```typescript
// In WorkerBridge or game logic
const treeId = createEntityId();
sharedBuffer.registerEntity(treeId);

await physicsApi.spawnEntity(
  { id: treeId, type: "static", transform: treeTransform },
  { type: "static", colliderType: "cylinder", ... }
);

await renderApi.spawnEntity(treeId, "tree", { variant: "oak" });
```

## Renderer Integration

The Renderer class uses EntityFactory and has generic lifecycle handling:

```typescript
class Renderer {
  private entities: Map<EntityId, RenderComponent> = new Map();
  private entityFactory: EntityFactory;
  
  async spawnEntity(id: EntityId, type: string, data?: Record<string, unknown>): Promise<void> {
    const entity = await this.entityFactory.create(id, type, data);
    this.entities.set(id, entity);
    
    // Special handling for player (camera follow)
    if (type === "player") {
      this.playerEntityId = id;
      this.followCamera.setTarget(entity.object);
    }
  }
  
  private update(delta: number, elapsed: number): void {
    const newFrameAvailable = this.readTransformsFromSharedBuffer();
    
    for (const entity of this.entities.values()) {
      // Update animations for any entity with a mixer
      if (entity.mixer) {
        entity.mixer.update(delta * 0.001);
      }
      
      // Per-frame updates (shaders, effects)
      entity.onRenderFrame?.(delta, elapsed);
    }
    
    // Physics-synced updates
    if (newFrameAvailable) {
      for (const entity of this.entities.values()) {
        entity.onPhysicsFrame?.(this.inputState);
      }
    }
  }
}
```

## Entities vs Objects

The codebase distinguishes between **entities** and **objects**:

| Concept | Location | Purpose |
|---------|----------|---------|
| **Entities** | `renderer/entities/` | Physics-synced, have lifecycle hooks, managed by EntityFactory |
| **Objects** | `renderer/objects/` | Pure visual components, no physics sync, managed manually |

### When to Use Each

**Use Entities when:**
- Object needs physics synchronization (position from physics worker)
- Object needs input-driven behavior (animations, state changes)
- Object is spawned/despawned dynamically

**Use Objects when:**
- Object is static scene decoration (skybox, static floor)
- Object doesn't need physics (shader planes, UI elements)
- Object is always present (environment, lighting)

## Design Decisions

### Why Factory + Registry Pattern?

1. **Open/Closed Principle**: Add new types without modifying Renderer
2. **Single Responsibility**: Each entity handles its own logic
3. **Testability**: Factories can be mocked for testing
4. **Discoverability**: Registry lists all available types

### Why Composition over Inheritance?

The `RenderComponent` interface allows different implementation strategies:

```typescript
// Wrapping existing classes
class PlayerEntity implements RenderComponent {
  private fox: Fox;  // Delegates to Fox
}

// Direct implementation
class GroundEntity implements RenderComponent {
  readonly object = new THREE.Object3D();  // No wrapped class
}
```

### Why Optional Lifecycle Hooks?

Not all entities need all hooks. A static decoration doesn't need `onPhysicsFrame`. Optional hooks keep simple entities simple:

```typescript
// Minimal entity - only required methods
class SimpleEntity implements RenderComponent {
  readonly id: EntityId;
  readonly type = "simple";
  readonly object: THREE.Object3D;
  
  dispose(): void { /* cleanup */ }
  // No optional hooks needed
}
```

## Troubleshooting

### Entity Not Appearing

1. Check entity is registered in EntityRegistry
2. Verify `sharedBuffer.registerEntity()` called before `renderApi.spawnEntity()`
3. Check console for "[Renderer] No buffer index for entity" errors

### Animations Not Playing

1. Ensure entity has `mixer` property set
2. Verify `onPhysicsFrame` is updating animation state
3. Check that animation names match GLTF file

### Transform Not Updating

1. Verify entity ID matches between physics and render workers
2. Check SharedTransformBuffer constructor argument order: `(control, transform, timing)`
3. Ensure `rebuildEntityMap()` called after entities registered

## Future Improvements

- **Data-driven spawning**: Load entity definitions from JSON/YAML
- **Entity pooling**: Reuse disposed entities for performance
- **Component composition**: Mix-and-match behaviors (e.g., `Animatable`, `Collidable`)
- **Network synchronization**: Replicate entities across clients
