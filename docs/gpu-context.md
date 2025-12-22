# GPU Context Management

This document explains GPU context lifecycle, potential issues with context exhaustion, and the current state of investigation.

## Known Issue: Context Exhaustion on Rapid Refresh

**Status**: Unresolved - investigating when this was introduced

Repeatedly refreshing the page (~5+ times in quick succession) can cause WebGPU/WebGL initialization to fail:

```
Failed to create WebGPU Context Provider
THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.
TypeError: Cannot read properties of null (reading 'getSupportedExtensions')
```

This issue appeared recently and was not present in earlier commits. Investigation is ongoing to identify the specific change that introduced it.

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
- The OffscreenCanvas with a context **cannot be transferred back** ([WHATWG issue #6615](https://github.com/whatwg/html/issues/6615))

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

## Attempted Fixes (Did Not Work)

### 1. beforeunload Handler

```typescript
window.addEventListener("beforeunload", () => {
  this.dispose();
});
```

**Why it failed**: The `dispose()` calls via Comlink are async (Promises). The page unloads before the worker can process the cleanup.

### 2. Synchronous postMessage Cleanup

Tried sending `{ type: "cleanup" }` directly to workers via `postMessage` to bypass Comlink's async handling.

**Why it failed**: Even with direct postMessage, the cleanup doesn't complete before the page unloads. The GPU context remains orphaned.

### 3. forceContextLoss for WebGL

```typescript
const ext = gl.getExtension("WEBGL_lose_context");
ext?.loseContext();
```

**Why it failed**: This only helps if the cleanup code actually executes before unload, which it doesn't due to the async nature of worker communication.

## If It Happens

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

## Future Investigation

To resolve this issue, we need to:

1. **Bisect commits** to find when the issue was introduced
2. **Check for GPU resource leaks** in recent changes
3. **Review Three.js WebGPURenderer changes** if the issue correlates with a Three.js update
4. **Consider alternative architectures** that don't use OffscreenCanvas transfer

## References

- [WebGPU Troubleshooting (Chrome)](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)
- [WebGPU Device Loss Best Practices](https://toji.dev/webgpu-best-practices/device-loss.html)
- [Three.js Context Release Issue](https://github.com/mrdoob/three.js/issues/27100)
- [OffscreenCanvas Transfer Limitations](https://github.com/whatwg/html/issues/6615)
- [GPUDeviceLostInfo (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/GPUDeviceLostInfo)
- [WEBGL_lose_context (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/WEBGL_lose_context)
