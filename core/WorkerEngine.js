import { UniversalEngine } from './UniversalEngine.js';
import { WorkerManager } from './WorkerManager.js';
import { reviveWorkerValue } from './WorkerCodec.js';

function defaultWorkerUrl() {
  return new URL('../workers/universal-engine.worker.js', import.meta.url);
}

function collectTransferables(value, target = [], seen = new WeakSet()) {
  if (!value || typeof value !== 'object') {
    return target;
  }
  if (value instanceof ArrayBuffer) {
    target.push(value);
    return target;
  }
  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) {
      target.push(value.buffer);
    }
    return target;
  }
  if (seen.has(value)) {
    return target;
  }
  seen.add(value);
  for (const item of Object.values(value)) {
    collectTransferables(item, target, seen);
  }
  return target;
}

export class WorkerEngine {
  constructor(options = {}) {
    this.syncEngine = options.syncEngine || new UniversalEngine();
    this.workerManager = options.workerManager || new WorkerManager(options.workerOptions);
    this.workerUrl = options.workerUrl || defaultWorkerUrl();
    this.preferWorker = options.preferWorker !== false;
    this.fallbackToSync = options.fallbackToSync !== false;
    this._initPromise = null;
    this._workerEnabled = false;
    this._workerFailed = false;
  }

  isWorkerAvailable() {
    return this.workerManager.isAvailable();
  }

  async init() {
    console.log('[WorkerEngine] init requested', {
      preferWorker: this.preferWorker,
      workerAvailable: this.isWorkerAvailable(),
      workerFailed: this._workerFailed
    });
    if (!this.preferWorker || !this.isWorkerAvailable() || this._workerFailed) {
      console.log('[WorkerEngine] init using sync fallback');
      return false;
    }
    if (this._workerEnabled) {
      console.log('[WorkerEngine] worker already enabled');
      return true;
    }
    if (!this._initPromise) {
      this._initPromise = this.workerManager.init(this.workerUrl)
        .then(() => {
          this._workerEnabled = true;
          console.log('[WorkerEngine] worker init complete');
          return true;
        })
        .catch(error => {
          this._workerFailed = true;
          this._workerEnabled = false;
          console.error('[WorkerEngine] worker init failed', error);
          if (!this.fallbackToSync) {
            throw error;
          }
          console.log('[WorkerEngine] falling back to sync engine');
          return false;
        });
    }
    return this._initPromise;
  }

  async terminate() {
    this.workerManager.terminate();
    this._workerEnabled = false;
    this._initPromise = null;
  }

  async describeCapabilities() {
    return this._invoke('describeCapabilities');
  }

  async describeSource(source) {
    return this._invoke('describeSource', { source }, source);
  }

  async traceBitmapToVectorSource(source, config = {}) {
    return this._invoke('traceBitmapToVectorSource', { source, config }, source);
  }

  async listOperations(filters = {}) {
    return this._invoke('listOperations', { filters });
  }

  async getDefaultConfig(operationId) {
    return this._invoke('getDefaultConfig', { operationId });
  }

  async createToolpath({ source, operationId, config = {} }) {
    return this._invoke('createToolpath', { source, operationId, config }, source);
  }

  async _invoke(type, payload = {}, transferSource = null) {
    console.log('[WorkerEngine] invoke start', {
      type,
      operationId: payload?.operationId
    });
    const useWorker = await this.init();
    if (!useWorker) {
      console.log('[WorkerEngine] invoke sync', {
        type,
        operationId: payload?.operationId
      });
      return this._invokeSync(type, payload);
    }
    const transferables = collectTransferables(transferSource);
    console.log('[WorkerEngine] invoke worker', {
      type,
      operationId: payload?.operationId,
      transferables: transferables.length
    });
    const result = await this.workerManager.postMessage(type, payload, transferables);
    console.log('[WorkerEngine] invoke worker result', {
      type,
      operationId: payload?.operationId
    });
    return reviveWorkerValue(result);
  }

  _invokeSync(type, payload) {
    if (type === 'describeCapabilities') {
      return this.syncEngine.describeCapabilities();
    }
    if (type === 'describeSource') {
      return this.syncEngine.describeSource(payload.source);
    }
    if (type === 'traceBitmapToVectorSource') {
      return this.syncEngine.traceBitmapToVectorSource(payload.source, payload.config);
    }
    if (type === 'listOperations') {
      return this.syncEngine.listOperations(payload.filters);
    }
    if (type === 'getDefaultConfig') {
      return this.syncEngine.getDefaultConfig(payload.operationId);
    }
    if (type === 'createToolpath') {
      return this.syncEngine.createToolpath(payload);
    }
    throw new Error(`Unknown worker engine request: ${type}`);
  }
}
