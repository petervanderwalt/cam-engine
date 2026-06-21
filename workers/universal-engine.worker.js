import { UniversalEngine } from '../core/UniversalEngine.js';
import { serializeWorkerValue } from '../core/WorkerCodec.js';

async function ensureClipperLib() {
  if (typeof ClipperLib !== 'undefined') {
    return;
  }
  const imported = await import('../dependencies/clipper-lib.cjs');
  if (typeof ClipperLib === 'undefined' && imported?.default) {
    globalThis.ClipperLib = imported.default;
  }
}

await ensureClipperLib();

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
  if (typeof process !== 'undefined' && process.versions?.node) {
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
