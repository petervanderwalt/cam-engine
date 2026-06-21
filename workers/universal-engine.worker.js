import { UniversalEngine } from '../core/UniversalEngine.js';
import { serializeWorkerValue } from '../core/WorkerCodec.js';

function isNodeRuntime() {
  return typeof process !== 'undefined' && !!process.versions?.node;
}

async function evalGlobalScript(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load script: ${response.status}`);
  }
  const source = await response.text();
  globalThis.eval(source);
}

async function ensureClipperLib() {
  if (typeof ClipperLib !== 'undefined') {
    return;
  }
  if (isNodeRuntime()) {
    const imported = await import('../dependencies/clipper-lib.cjs');
    if (typeof ClipperLib === 'undefined' && imported?.default) {
      globalThis.ClipperLib = imported.default;
    }
    return;
  }
  await evalGlobalScript(new URL('../dependencies/clipper-lib.cjs', import.meta.url));
  if (typeof ClipperLib === 'undefined') {
    throw new Error('ClipperLib did not initialize in worker runtime');
  }
}

async function ensureCamCpp() {
  if (typeof Module !== 'undefined' && typeof Module._vCarve === 'function' && typeof Module._separateTabs === 'function') {
    return;
  }
  if (isNodeRuntime()) {
    return;
  }
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
await ensureCamCpp();

const engine = new UniversalEngine();

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

scope.onMessage(async data => {
  const { id, type, payload } = data;
  try {
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
    scope.postMessage({
      id,
      result: serializeWorkerValue(result)
    });
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
