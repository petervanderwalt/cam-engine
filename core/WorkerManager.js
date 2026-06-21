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
        this.worker = this._workerFactory
          ? this._workerFactory(workerUrl, { type: 'module' })
          : new Worker(workerUrl, { type: 'module' });
        this.worker.onmessage = (e) => this._handleMessage(e.data);
        this.worker.onerror = (e) => {
          this._rejectAll(e.message);
          reject(e);
        };
        this._ready = true;
        resolve();
      } catch (e) {
        reject(e);
      }
    });
  }

  async _initNode(workerUrl) {
    try {
      const { Worker } = await import('worker_threads');
      this.worker = this._workerFactory
        ? this._workerFactory(workerUrl, { type: 'module' })
        : new Worker(workerUrl, { type: 'module' });
      this.worker.on('message', (data) => this._handleMessage(data));
      this.worker.on('error', (e) => {
        this._rejectAll(e.message);
      });
      this._ready = true;
    } catch (e) {
      throw new Error('Node.js Worker init failed: ' + e.message);
    }
  }

  _handleMessage(data) {
    const { id, result, error } = data;
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
        if (this._useWorker && transferables) {
          this.worker.postMessage(msg, transferables);
        } else if (this.worker) {
          this.worker.postMessage(msg);
        }
      } catch (e) {
        this._pending.delete(id);
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
