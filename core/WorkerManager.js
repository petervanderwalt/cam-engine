export class WorkerManager {
  constructor(options = {}) {
    this.worker = null;
    this._pending = new Map();
    this._idCounter = 0;
    this._ready = false;
    this._useWorker = options.forceBrowserWorker ? true : typeof Worker !== 'undefined';
    this._useNodeWorker = options.forceNodeWorker ? true : false;
    this._workerFactory = options.workerFactory || null;
    try {
      if (!options.forceBrowserWorker && typeof process !== 'undefined' && process.versions && process.versions.node) {
        this._useNodeWorker = true;
        this._useWorker = false;
      }
    } catch (e) {}
  }

  isAvailable() {
    return this._useWorker || this._useNodeWorker;
  }

  async init(workerUrl) {
    console.log('[WorkerManager] init', {
      workerUrl: String(workerUrl),
      browserWorker: this._useWorker,
      nodeWorker: this._useNodeWorker
    });
    if (this._useWorker) {
      return this._initBrowser(workerUrl);
    } else if (this._useNodeWorker) {
      return this._initNode(workerUrl);
    }
    throw new Error('Workers not available in this environment');
  }

  _initBrowser(workerUrl) {
    return new Promise((resolve, reject) => {
      try {
        console.log('[WorkerManager] starting browser worker', String(workerUrl));
        let settled = false;
        this.worker = this._workerFactory
          ? this._workerFactory(workerUrl, { type: 'module' })
          : new Worker(workerUrl, { type: 'module' });
        this.worker.onmessage = (e) => {
          if (e.data?.type === 'ready') {
            this._ready = true;
            console.log('[WorkerManager] browser worker handshake complete');
            if (!settled) {
              settled = true;
              resolve();
            }
            return;
          }
          this._handleMessage(e.data);
        };
        this.worker.onerror = (e) => {
          console.error('[WorkerManager] browser worker error', e);
          this._rejectAll(e.message);
          if (!settled) {
            settled = true;
            reject(e);
          }
        };
        console.log('[WorkerManager] waiting for browser worker handshake');
      } catch (e) {
        console.error('[WorkerManager] browser worker init failed', e);
        reject(e);
      }
    });
  }

  async _initNode(workerUrl) {
    try {
      const { Worker } = await import('worker_threads');
      console.log('[WorkerManager] starting node worker', String(workerUrl));
      await new Promise((resolve, reject) => {
        let settled = false;
        this.worker = this._workerFactory
          ? this._workerFactory(workerUrl, { type: 'module' })
          : new Worker(workerUrl, { type: 'module' });
        this.worker.on('message', (data) => {
          if (data?.type === 'ready') {
            this._ready = true;
            console.log('[WorkerManager] node worker handshake complete');
            if (!settled) {
              settled = true;
              resolve();
            }
            return;
          }
          this._handleMessage(data);
        });
        this.worker.on('error', (e) => {
          console.error('[WorkerManager] node worker error', e);
          this._rejectAll(e.message);
          if (!settled) {
            settled = true;
            reject(e);
          }
        });
      });
    } catch (e) {
      console.error('[WorkerManager] node worker init failed', e);
      throw new Error('Node.js Worker init failed: ' + e.message);
    }
  }

  _handleMessage(data) {
    const { id, result, error } = data;
    console.log('[WorkerManager] message received', {
      id,
      hasError: !!error,
      hasResult: result !== undefined
    });
    const pending = this._pending.get(id);
    if (!pending) return;
    this._pending.delete(id);
    if (error) {
      pending.reject(new Error(error));
    } else {
      pending.resolve(result);
    }
  }

  _rejectAll(message) {
    for (const [id, pending] of this._pending) {
      pending.reject(new Error(message));
    }
    this._pending.clear();
  }

  postMessage(type, payload, transferables) {
    return new Promise((resolve, reject) => {
      if (!this.worker || !this._ready) {
        reject(new Error('Worker is not initialized'));
        return;
      }
      const id = ++this._idCounter;
      this._pending.set(id, { resolve, reject });
      try {
        const msg = { id, type, payload };
        console.log('[WorkerManager] posting message', {
          id,
          type,
          transferables: transferables?.length || 0
        });
        if (this._useWorker && transferables) {
          this.worker.postMessage(msg, transferables);
        } else if (this.worker) {
          this.worker.postMessage(msg);
        }
      } catch (e) {
        this._pending.delete(id);
        console.error('[WorkerManager] postMessage failed', { id, type, error: e });
        reject(e);
      }
    });
  }

  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this._pending.clear();
    this._ready = false;
  }

  runOperation(operationType, inputData, config) {
    return this.postMessage('generate', {
      operationType,
      inputData,
      config
    });
  }
}
