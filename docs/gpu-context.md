# WebGPU Context Exhaustion Issue

## Overview

When using WebGPU with OffscreenCanvas in a Web Worker, rapidly refreshing the page (~5 times) can cause WebGPU initialization to fail.

**Status**: Resolved - reverted to WebGL.

> **Resolution**: Due to the browser-level nature of this issue, we reverted from WebGPU to WebGL. The project now uses `THREE.WebGLRenderer` with standard Three.js imports (`import * as THREE from "three"`). This eliminates the context exhaustion problem entirely while maintaining all functionality.

## Error Messages

```
Failed to create WebGPU Context Provider
THREE.WebGPURenderer: WebGPU is not available, running under WebGL2 backend.
TypeError: Cannot read properties of null (reading 'getSupportedExtensions')
```

## Root Cause

### Chrome's GPU Process Crash Limits

Chrome enforces strict limits on GPU adapter allocation after failures:

| Failures | Consequence |
|----------|-------------|
| 1st | Can still get new adapter |
| 2nd within 2 min | Page blocked from adapters |
| 3rd within 2 min | ALL pages blocked from adapters |
| 3-6 in 5 min | GPU process stops; browser restart required |

### Why This Happens

1. **OffscreenCanvas + Worker + WebGPU** creates complex resource ownership
2. Page refresh terminates the worker abruptly
3. GPU device in worker is orphaned (not properly destroyed)
4. Chrome interprets orphaned devices as "crashes"
5. After several refreshes, adapter limits are hit

### The Race Condition

When attempting cleanup:
1. `beforeunload` fires on main thread
2. Cleanup message sent to worker
3. `worker.terminate()` called immediately
4. Worker may be terminated before processing cleanup
5. GPU device destruction timing is not guaranteed

## What We Tried (All Failed)

1. **beforeunload + dispose()** - Async Comlink calls don't complete
2. **Direct postMessage cleanup** - Race condition with terminate()
3. **Explicit device.destroy()** - Never executes due to race
4. **forceContextLoss()** - Only helps WebGL, same race issue

## Workarounds

### For Users

1. **Wait 2 minutes** - Chrome's block resets after 2 min
2. **Restart browser** - Clears all GPU limits
3. **Check chrome://gpu** - Verify WebGPU availability

### For Development

Launch Chrome with flags to disable limits:
```bash
chrome --disable-domain-blocking-for-3d-apis --disable-gpu-process-crash-limit
```

Or via `chrome://flags`:
- Enable `#enable-unsafe-webgpu`

## Related Issues

### Chromium

- [Issue 1224835](https://bugs.chromium.org/p/chromium/issues/detail?id=1224835) - WebGPU memory leak
- [Issue 811220](https://bugs.chromium.org/p/chromium/issues/detail?id=811220) - WebGL memory leak on refresh
- [Issue 248002](https://bugs.chromium.org/p/chromium/issues/detail?id=248002) - GPU memory not freed on reload

### Three.js

- [PR #30647](https://github.com/mrdoob/three.js/pull/30647) - WebGPURenderer dispose fixes
- [Issue #3776](https://github.com/mrdoob/three.js/issues/3776) - GPU memory leak on refresh

## Resolution

We chose to revert from WebGPU to WebGL for the following reasons:

1. **No application-level fix exists** - The race condition between worker termination and GPU device cleanup cannot be reliably solved from application code
2. **WebGL is mature and stable** - No context exhaustion issues with OffscreenCanvas + Workers
3. **Minimal feature loss** - For this project's needs, WebGL2 provides all required functionality
4. **Better browser support** - WebGL2 has wider compatibility

### Changes Made

- Changed `import * as THREE from "three/webgpu"` to `import * as THREE from "three"` across all files
- Changed `THREE.WebGPURenderer` to `THREE.WebGLRenderer`
- Removed async `renderer.init()` call (WebGL initialization is synchronous)
- Changed `MeshStandardNodeMaterial` to `MeshStandardMaterial` (node materials are WebGPU-specific)

### Future WebGPU Considerations

WebGPU may be revisited when:
- Chrome/Dawn improves device cleanup during worker termination
- Three.js provides better lifecycle management for WebGPU in workers
- A reliable cleanup mechanism becomes available

## Historical Context

This issue exists at the intersection of:
- WebGPU (newer, less mature than WebGL)
- OffscreenCanvas in Web Workers
- Page unload timing
- Chrome's GPU process crash protection

The problem was discovered after upgrading from WebGL to WebGPU in commit `03c5b98`. The WebGL version never exhibited this behavior.

## References

- [Chrome WebGPU Troubleshooting](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips)
- [WebGPU Device Loss Best Practices](https://toji.dev/webgpu-best-practices/device-loss.html)
- [MDN GPUDevice.destroy()](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/destroy)
- [MDN beforeunload event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)
