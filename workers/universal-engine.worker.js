import { UniversalEngine } from '../core/UniversalEngine.js';
import { serializeWorkerValue } from '../core/WorkerCodec.js';

console.log('[cam-engine worker] module boot');

function isNodeRuntime() {
  return typeof process !== 'undefined' && !!process.versions?.node;
}

async function evalGlobalScript(url) {
  console.log('[cam-engine worker] loading script', String(url));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load script: ${response.status}`);
  }
  const source = await response.text();
  globalThis.eval(source);
  console.log('[cam-engine worker] loaded script', String(url));
}

async function ensureClipperLib() {
  if (typeof ClipperLib !== 'undefined') {
    console.log('[cam-engine worker] ClipperLib already available');
    return;
  }
  if (isNodeRuntime()) {
    console.log('[cam-engine worker] importing ClipperLib in node');
    const imported = await import('../dependencies/clipper-lib.cjs');
    if (typeof ClipperLib === 'undefined' && imported?.default) {
      globalThis.ClipperLib = imported.default;
    }
    console.log('[cam-engine worker] ClipperLib ready in node');
    return;
  }
  await evalGlobalScript(new URL('../dependencies/clipper-lib.cjs', import.meta.url));
  if (typeof ClipperLib === 'undefined') {
    throw new Error('ClipperLib did not initialize in worker runtime');
  }
  console.log('[cam-engine worker] ClipperLib ready in browser worker');
}

async function ensureCamCpp() {
  if (typeof Module !== 'undefined' && typeof Module._vCarve === 'function' && typeof Module._separateTabs === 'function') {
    console.log('[cam-engine worker] cam-cpp already ready');
    return;
  }
  if (isNodeRuntime()) {
    console.log('[cam-engine worker] skipping cam-cpp bootstrap in node runtime');
    return;
  }
  console.log('[cam-engine worker] starting cam-cpp bootstrap');
  const wasmBase = new URL('../dependencies/cam-cpp/', import.meta.url);
  globalThis.Module = {
    ...(globalThis.Module || {}),
    locateFile(path) {
      return new URL(path, wasmBase).href;
    }
  };
  await evalGlobalScript(new URL('../dependencies/cam-cpp/web-cam-cpp.js', import.meta.url));
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('cam-cpp WASM worker init timed out')), 15000);
    const done = () => {
      clearTimeout(timeout);
      console.log('[cam-engine worker] cam-cpp ready');
      resolve();
    };
    if (typeof Module !== 'undefined' && typeof Module._vCarve === 'function' && typeof Module._separateTabs === 'function') {
      done();
      return;
    }
    const prior = globalThis.Module?.onRuntimeInitialized;
    globalThis.Module.onRuntimeInitialized = function () {
      if (prior) prior();
      done();
    };
  });
}

await ensureClipperLib();
console.log('[cam-engine worker] core dependencies ready');

const engine = new UniversalEngine();
console.log('[cam-engine worker] UniversalEngine created');

async function ensureDependenciesForRequest(type, payload) {
  if (type === 'createToolpath' && payload?.operationId === 'vector-vcarve') {
    console.log('[cam-engine worker] request needs cam-cpp', payload.operationId);
    await ensureCamCpp();
  }
}

async function getHandlerScope() {
  if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
    return {
      onMessage(callback) {
        self.onmessage = event => callback(event.data);
      },
      postMessage(message) {
        self.postMessage(message);
      }
    };
  }
  if (isNodeRuntime()) {
    const { parentPort } = await import('worker_threads');
    return {
      onMessage(callback) {
        parentPort.on('message', callback);
      },
      postMessage(message) {
        parentPort.postMessage(message);
      }
    };
  }
  throw new Error('Unsupported worker runtime');
}

const scope = await getHandlerScope();
console.log('[cam-engine worker] message scope ready');
scope.postMessage({ type: 'ready' });
console.log('[cam-engine worker] ready handshake sent');

scope.onMessage(async data => {
  const { id, type, payload } = data;
  console.log('[cam-engine worker] request start', {
    id,
    type,
    operationId: payload?.operationId
  });
  try {
    await ensureDependenciesForRequest(type, payload);
    let result;
    if (type === 'describeCapabilities') {
      result = engine.describeCapabilities();
    } else if (type === 'describeSource') {
      result = engine.describeSource(payload.source);
    } else if (type === 'traceBitmapToVectorSource') {
      result = engine.traceBitmapToVectorSource(payload.source, payload.config);
    } else if (type === 'listOperations') {
      result = engine.listOperations(payload.filters);
    } else if (type === 'getDefaultConfig') {
      result = engine.getDefaultConfig(payload.operationId);
    } else if (type === 'createToolpath') {
      result = engine.createToolpath(payload);
    } else {
      throw new Error(`Unknown worker request: ${type}`);
    }
    console.log('[cam-engine worker] request complete', {
      id,
      type,
      operationId: payload?.operationId
    });
    scope.postMessage({
      id,
      result: serializeWorkerValue(result)
    });
  } catch (error) {
    console.error('[cam-engine worker] request failed', {
      id,
      type,
      operationId: payload?.operationId,
      error
    });
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
