# GPU Context Management

This document explains GPU context lifecycle, potential issues with context exhaustion, and how this project handles them.

## The Problem

Repeatedly refreshing the page (~5+ times in quick succession) can cause WebGPU/WebGL initialization to fail:

```
Failed to create WebGPU Context Provider
THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.
TypeError: Cannot read properties of null (reading 'getSupportedExtensions')
```

This happens because browsers have strict limits on GPU contexts to prevent resource exhaustion and abuse.

## Why This Happens

### Architecture Context

This application uses:
- **OffscreenCanvas**: Transferred to a Web Worker for rendering
- **WebGPURenderer**: Three.js's WebGPU-based renderer (falls back to WebGL2)
- **Web Workers**: Render and physics run in separate threads

### The Lifecycle Problem

1. **Page loads**: Worker acquires GPU device via `navigator.gpu.requestAdapter()`
2. **User refreshes**: Main thread unloads, but worker cleanup is async
3. **New page loads**: Tries to acquire new GPU device
4. **Problem**: Old device may still be held by terminated worker
5. **After ~5 refreshes**: Chrome's GPU process is exhausted

### OffscreenCanvas Complication

When you call `canvas.transferControlToOffscreen()`:
- Control is **permanently** transferred to the worker
- Main thread can no longer access the canvas context
- Worker termination doesn't guarantee immediate GPU resource release

## Browser GPU Limits

### Chrome's Rules

From [WebGPU Troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips):

| Scenario | Result |
|----------|--------|
| 1st GPU crash | Can get new adapter |
| 2nd crash within 2 min | Page blocked from new adapters |
| 3rd crash within 2 min | ALL pages blocked |
| 3-6 crashes in 5 min | GPU process stops entirely |

These limits protect against:
- Malicious pages exhausting GPU resources
- Runaway shaders causing system instability
- Memory leaks from improperly disposed contexts

### WebGL Context Limits

Browsers typically allow 8-16 WebGL contexts per origin. Once exhausted:
- `getContext("webgl2")` returns `null`
- Fallback rendering is impossible

## How We Prevent It

### 1. Cleanup on Page Unload

**File**: `src/app/index.ts`

```typescript
window.addEventListener("beforeunload", () => {
  this.dispose();
});
```

This triggers cleanup before the page unloads.

### 2. Synchronous Worker Cleanup Messages

**The Problem**: Comlink proxy calls (like `renderApi.dispose()`) are async and won't complete before the page unloads.

**The Solution**: Send a direct `postMessage` to workers, which they handle synchronously.

**File**: `src/app/worker-coordinator.ts`

```typescript
cleanupSync(): void {
  // Send cleanup message directly (bypasses Comlink's async handling)
  this.renderWorker?.postMessage({ type: "cleanup" });
  this.physicsWorker?.postMessage({ type: "cleanup" });
}
```

**File**: `src/workers/render.worker.ts`

```typescript
// Module-level reference for cleanup handler
let experience: Experience | null = null;

// Handle synchronous cleanup messages
self.addEventListener("message", (event: MessageEvent) => {
  if (event.data?.type === "cleanup") {
    experience?.dispose();
    experience = null;
  }
});
```

This ensures the GPU context is released **before** the page unloads, not after.

### 3. Force WebGL Context Loss

**File**: `src/renderer/core/renderer.ts`

When running under WebGL2 backend, we explicitly release the context:

```typescript
dispose(): void {
  // Force WebGL context loss
  const gl = (this.instance as any).backend?.gl;
  if (gl) {
    const ext = gl.getExtension("WEBGL_lose_context");
    ext?.loseContext();
  }
  
  this.instance.dispose();
}
```

This is the recommended pattern from [Three.js issue #27100](https://github.com/mrdoob/three.js/issues/27100).

### 4. Device Loss Handling

**File**: `src/renderer/core/renderer.ts`

We listen for GPU device loss events:

```typescript
device.lost.then((info: GPUDeviceLostInfo) => {
  console.warn(`[Renderer] GPU device lost (${reason}): ${message}`);
});
```

This helps diagnose issues and could enable future recovery mechanisms.

## If It Still Happens

If you encounter GPU context exhaustion:

### For Users

1. **Wait 2 minutes** - Chrome's limits reset after this period
2. **Restart browser** - Clears all GPU state
3. **Check other tabs** - Other WebGL/WebGPU apps may be consuming contexts

### For Developers

Use Chrome flags to disable limits during development:

```bash
chrome --disable-domain-blocking-for-3d-apis --disable-gpu-process-crash-limit
```

**Warning**: Only use these flags for development, never in production.

## Device Loss Causes

GPU device loss can happen for several reasons:

| Cause | Description |
|-------|-------------|
| Driver crash | GPU driver encountered an error |
| Resource pressure | Out of GPU memory |
| Long-running shader | Chrome's watchdog kills shaders >10 seconds |
| Driver update | GPU configuration changed |
| System sleep/resume | GPU state was reset |
| Explicit destroy | `device.destroy()` was called |

## Best Practices

### Do

- ✅ Always call `dispose()` when done with renderer
- ✅ Add `beforeunload` handler for cleanup
- ✅ Use `forceContextLoss()` for WebGL contexts
- ✅ Listen for `device.lost` events
- ✅ Handle `requestAdapter()` returning `null`

### Don't

- ❌ Create multiple renderers without disposing old ones
- ❌ Ignore cleanup on hot module replacement (HMR)
- ❌ Assume GPU contexts are unlimited
- ❌ Skip error handling for GPU initialization

## Recovery Strategies

From [WebGPU Device Loss Best Practices](https://toji.dev/webgpu-best-practices/device-loss.html):

1. **Minimum**: Display message suggesting page refresh
2. **Better**: Reinitialize WebGPU independently from page
3. **Best**: Save state to localStorage, reconstruct after recovery

Currently, this project uses the minimum approach. The user sees an error message and can refresh the page.

## Related Files

| File | Purpose |
|------|---------|
| `src/app/index.ts` | `beforeunload` handler |
| `src/renderer/core/renderer.ts` | GPU cleanup and device loss handling |
| `src/app/components/error-overlay.ts` | `GPU_CONTEXT_EXHAUSTED` message |
| `src/app/worker-coordinator.ts` | Worker termination |

## References

- [WebGPU Troubleshooting (Chrome)](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)
- [WebGPU Device Loss Best Practices](https://toji.dev/webgpu-best-practices/device-loss.html)
- [Three.js Context Release Issue](https://github.com/mrdoob/three.js/issues/27100)
- [GPUDeviceLostInfo (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/GPUDeviceLostInfo)
- [WEBGL_lose_context (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context)
