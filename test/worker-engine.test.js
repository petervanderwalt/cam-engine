import test from 'node:test';
import assert from 'node:assert/strict';
import { WorkerEngine } from '../core/WorkerEngine.js';
import { UniversalEngine } from '../core/UniversalEngine.js';

function square(size = 10) {
  return [ {
    points: [
      { x: 0, y: 0, z: 0 },
      { x: size, y: 0, z: 0 },
      { x: size, y: size, z: 0 },
      { x: 0, y: size, z: 0 }
    ],
    closed: true
  } ];
}

test('WorkerEngine: worker-backed vector cut matches sync engine output', async () => {
  const workerEngine = new WorkerEngine({
    workerUrl: new URL('../workers/universal-engine.worker.js', import.meta.url)
  });
  const syncEngine = new UniversalEngine();
  try {
    const syncJob = syncEngine.createToolpath({
      source: { type: 'vector', paths: square(25) },
      operationId: 'vector-cut',
      config: { zStart: 0, zEnd: -2, passDepth: 1 }
    });
    const asyncJob = await workerEngine.createToolpath({
      source: { type: 'vector', paths: square(25) },
      operationId: 'vector-cut',
      config: { zStart: 0, zEnd: -2, passDepth: 1 }
    });
    assert.equal(asyncJob.result.operationType, 'vector-cut');
    assert.deepEqual(asyncJob.result.metadata.levels, syncJob.result.metadata.levels);
    assert.deepEqual(asyncJob.result.bounds, syncJob.result.bounds);
    assert.equal(asyncJob.result.totalCutDistance, syncJob.result.totalCutDistance);
  } finally {
    await workerEngine.terminate();
  }
});

test('WorkerEngine: worker-backed STL description parses off-thread', async () => {
  const workerEngine = new WorkerEngine({
    workerUrl: new URL('../workers/universal-engine.worker.js', import.meta.url)
  });
  try {
    const buffer = new ArrayBuffer(84);
    const view = new DataView(buffer);
    view.setUint32(80, 0, true);
    const source = await workerEngine.describeSource({ type: 'mesh', format: 'stl', buffer });
    assert.equal(source.mesh.format, 'binary');
    assert.equal(source.mesh.triangles, 0);
  } finally {
    await workerEngine.terminate();
  }
});

test('WorkerEngine: falls back to sync execution when workers are disabled', async () => {
  const workerEngine = new WorkerEngine({
    preferWorker: false
  });
  const job = await workerEngine.createToolpath({
    source: { type: 'vector', paths: square(20) },
    operationId: 'vector-cut',
    config: { mode: 'cut' }
  });
  assert.equal(job.result.operationType, 'vector-cut');
  assert.ok(job.result.paths.length > 0);
});

