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

## Collider Types

Rapier supports several collider shapes:

| Type | Method | Performance | Accuracy | Use Case |
|------|--------|-------------|----------|----------|
| Cuboid | `ColliderDesc.cuboid(hx, hy, hz)` | Fastest | Low | Simple boxes, floors |
| Capsule | `ColliderDesc.capsule(halfHeight, radius)` | Fast | Medium | Characters, cylinders |
| Ball | `ColliderDesc.ball(radius)` | Fast | Medium | Spheres, projectiles |
| Convex Hull | `ColliderDesc.convexHull(points)` | Medium | High | Dynamic props |
| Trimesh | `ColliderDesc.trimesh(vertices, indices)` | Slow | Highest | Static geometry only |

### Current Implementation

The project currently uses simple primitives defined in `worker-bridge.ts`:

```typescript
// Ground: Static cuboid
await physicsApi.spawnEntity(
  { id: groundId, type: "static", transform: groundTransform },
  {
    type: "static",
    colliderType: "cuboid",
    dimensions: config.ground.dimensions,
  }
);

// Player: Character controller with capsule
await physicsApi.spawnPlayer(playerId, playerTransform, {
  capsuleRadius: config.characterController.capsuleRadius,
  capsuleHeight: config.characterController.capsuleHeight,
  // ...
});
```

## Debug Visualization

Physics colliders can be visualized as green wireframes when debug mode is enabled.

### Enabling Debug Visualization

1. Add `#debug` to the URL: `http://localhost:5173/#debug`
2. In the Tweakpane UI, find the "Physics" folder
3. Toggle "Show Colliders" checkbox

### How It Works

Debug collider info is passed from `WorkerBridge` to the render worker at spawn time:

```typescript
// In worker-bridge.ts
const playerDebugCollider: DebugCollider = {
  shape: {
    type: "capsule",
    radius: config.characterController.capsuleRadius,
    halfHeight: config.characterController.capsuleHeight / 2,
  },
};

await renderApi.spawnEntity(playerId, "player", undefined, playerDebugCollider);
```

The `PhysicsDebugRenderer` class creates wireframe meshes that follow entity transforms:

```typescript
// Creates THREE.CapsuleGeometry, THREE.BoxGeometry, etc.
// with MeshBasicMaterial({ wireframe: true, color: 0x00ff00 })
```

### Supported Debug Shapes

```typescript
type DebugColliderShape =
  | { type: "cuboid"; halfExtents: { x: number; y: number; z: number } }
  | { type: "capsule"; radius: number; halfHeight: number }
  | { type: "ball"; radius: number };
```

## Future: Automatic Collider Generation from Meshes

> **Status**: Planned, not yet implemented

Rapier supports creating colliders directly from mesh geometry. This would allow automatic physics collider creation from Three.js models.

### The Challenge

In this multi-worker architecture:
- Models are loaded in the **Render Worker** (Three.js/GLTF)
- Physics runs in the **Physics Worker** (Rapier)
- Three.js mesh objects cannot be transferred between workers

### Proposed Solution

Extract geometry data (vertices/indices) in the render worker and transfer as `Float32Array`:

```
┌─────────────────┐                    ┌─────────────────┐
│  Render Worker  │                    │  Physics Worker │
│                 │                    │                 │
│  Load GLTF      │                    │                 │
│       ↓         │                    │                 │
│  Extract verts  │ ──Float32Array──>  │  Create collider│
│  from geometry  │                    │  convexHull()   │
└─────────────────┘                    └─────────────────┘
```

### Geometry Extraction Approaches

**1. Bounding Box (Simplest)**
```typescript
function extractBoundingBox(model: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  return {
    type: 'boundingBox',
    halfExtents: { x: size.x / 2, y: size.y / 2, z: size.z / 2 }
  };
}
```

**2. Convex Hull (Best for Dynamic Objects)**
```typescript
function extractConvexHull(model: THREE.Object3D) {
  const vertices: number[] = [];
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const positions = child.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(positions, i);
        child.localToWorld(v); // Apply world transform
        vertices.push(v.x, v.y, v.z);
      }
    }
  });
  return new Float32Array(vertices);
}

// In physics worker
const collider = ColliderDesc.convexHull(vertices);
```

**3. Triangle Mesh (Static Geometry Only)**
```typescript
function extractTrimesh(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position.array as Float32Array;
  const indices = geometry.index?.array as Uint32Array;
  return { vertices: positions, indices };
}

// In physics worker
const collider = ColliderDesc.trimesh(vertices, indices);
```

### Implementation Phases

1. **Add geometry extraction utility** (`src/shared/utils/geometry-extractor.ts`)
2. **Add RenderApi method** - `getEntityGeometry(id, type)` returns extracted geometry
3. **Extend PhysicsBodyConfig** - Support geometry-based collider configs
4. **Update spawn flow** - Render first, then physics with geometry data
5. **Update debug visualization** - Render convex hull wireframes

### Spawn Flow Change

Current flow spawns physics first, then render. For mesh-derived colliders, this would need to change:

```typescript
// New flow for auto-collider entities
async spawnEntityWithAutoCollider(id, type, transform, colliderType) {
  // 1. Spawn render entity (loads model)
  await renderApi.spawnEntity(id, type);
  
  // 2. Extract geometry from loaded model
  const geometry = await renderApi.getEntityGeometry(id, colliderType);
  
  // 3. Spawn physics with extracted geometry
  await physicsApi.spawnEntityWithGeometry(id, transform, geometry);
}
```

### When to Use Each Collider Type

| Collider | Best For | Avoid For |
|----------|----------|-----------|
| **Capsule** | Player characters, NPCs | - |
| **Bounding Box** | Simple props, crates | Complex shapes |
| **Convex Hull** | Dynamic objects, vehicles | Concave shapes |
| **Trimesh** | Static level geometry, terrain | Dynamic objects (performance) |

### Note on Characters

For player/character controllers, a **capsule collider is intentionally preferred** over mesh-derived colliders:
- Capsules slide smoothly along surfaces
- No sharp edges to get stuck on
- Predictable collision response
- Much better gameplay feel

Mesh-derived colliders are best for:
- Static environment geometry
- Dynamic props and objects
- Obstacles and decorations

## Character Controller

The player uses Rapier's `KinematicCharacterController` for smooth movement:

```typescript
// Configuration (from config.ts)
characterController: {
  capsuleRadius: 0.3,
  capsuleHeight: 0.8,
  stepHeight: 0.3,        // Auto-step up stairs
  maxSlopeAngle: 45,      // Walkable slope limit
  minSlopeSlideAngle: 30, // Slide down steep slopes
}
```

### Input Flow

```
Main Thread                Physics Worker
     │                          │
     │  setPlayerInput({        │
     │    forward: true,        │
     │    sprint: true,         │
     │  })                      │
     │ ────────────────────────>│
     │                          │ Calculate velocity
     │                          │ controller.computeMovement()
     │                          │ Apply to rigid body
     │                          │ Write transform to SAB
```

## Configuration

All physics settings in `src/shared/config.ts`:

```typescript
export const config = {
  physics: {
    gravity: { x: 0, y: -20, z: 0 },
    interval: 1000 / 60,  // 60Hz fixed timestep
  },
  player: {
    moveSpeed: 3,
    sprintMultiplier: 2,
    turnSpeed: 3,
  },
  characterController: {
    capsuleRadius: 0.3,
    capsuleHeight: 0.8,
    stepHeight: 0.3,
    maxSlopeAngle: 45,
    minSlopeSlideAngle: 30,
  },
  ground: {
    dimensions: { x: 100, y: 1, z: 100 },
    position: { x: 0, y: -0.5, z: 0 },
  },
};
```

## References

- [Rapier Documentation](https://rapier.rs/docs/)
- [Rapier JavaScript 3D API](https://rapier.rs/javascript3d/)
- [react-three-rapier](https://github.com/pmndrs/react-three-rapier) - Reference for auto-collider patterns
