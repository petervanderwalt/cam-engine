import test from 'node:test';
import assert from 'node:assert/strict';
import { UniversalEngine } from '../core/UniversalEngine.js';

function square(size = 10) {
  return [{
    points: [
      { x: 0, y: 0, z: 0 },
      { x: size, y: 0, z: 0 },
      { x: size, y: size, z: 0 },
      { x: 0, y: size, z: 0 }
    ],
    closed: true
  }];
}

test('UniversalEngine: lists vector toolpath operations', () => {
  const engine = new UniversalEngine();
  const operations = engine.listOperations({ sourceType: 'vector' });
  assert.ok(operations.some(operation => operation.id === 'vector-cut'));
  assert.ok(operations.some(operation => operation.id === 'laser-vector'));
  assert.ok(operations.some(operation => operation.id === 'vector-pocket'));
  assert.ok(operations.some(operation => operation.id === 'vector-crosshatch'));
  assert.ok(operations.some(operation => operation.id === 'drag-knife'));
  assert.ok(!operations.some(operation => operation.id === 'vector-stepdown'));
});

test('UniversalEngine: generates normalized toolpath job from vector source', () => {
  const engine = new UniversalEngine();
  const job = engine.createToolpath({
    source: { type: 'vector', paths: square(25) },
    operationId: 'vector-cut',
    config: { mode: 'cut' }
  });
  assert.equal(job.sourceType, 'vector');
  assert.equal(job.result.operationType, 'vector-cut');
  assert.ok(job.result.paths.length > 0);
  assert.ok(job.result.totalCutDistance > 0);
});

test('UniversalEngine: vector cut supports built-in multi-pass depth', () => {
  const engine = new UniversalEngine();
  const job = engine.createToolpath({
    source: { type: 'vector', paths: square(25) },
    operationId: 'vector-cut',
    config: { zStart: 0, zEnd: -2, passDepth: 1 }
  });
  assert.equal(job.result.operationType, 'vector-cut');
  assert.deepEqual(job.result.metadata.levels, [-1, -2]);
  assert.equal(job.result.bounds.minZ, -2);
});

test('UniversalEngine: vector vcarve normalizes clipper-scale output to mm', () => {
  const engine = new UniversalEngine();
  const scale = engine.registry.vCarveOperation.clipper.mmToClipperScale;
  engine.registry.vCarveOperation.generate = () => ([
    {
      safeToClose: false,
      path: [
        { X: 0, Y: 0, Z: 0 },
        { X: 10 * scale, Y: 0, Z: -1 * scale },
        { X: 10 * scale, Y: 10 * scale, Z: -1 * scale }
      ]
    }
  ]);
  const job = engine.createToolpath({
    source: { type: 'vector', paths: square(10) },
    operationId: 'vector-vcarve',
    config: { cutterAngle: 60, passDepth: 0.5, maxDepth: 1 }
  });
  assert.equal(job.result.operationType, 'vector-vcarve');
  assert.equal(job.result.paths.length, 1);
  assert.equal(job.result.paths[0].points[1].x, 10);
  assert.equal(job.result.paths[0].points[2].y, 10);
  assert.equal(job.result.paths[0].points[1].z, -1);
});

test('UniversalEngine: describes STL mesh sources', () => {
  const engine = new UniversalEngine();
  const buffer = new ArrayBuffer(84);
  const view = new DataView(buffer);
  view.setUint32(80, 0, true);
  const source = engine.describeSource({ type: 'mesh', format: 'stl', buffer });
  assert.equal(source.mesh.format, 'binary');
  assert.equal(source.mesh.triangles, 0);
});

test('UniversalEngine: lists mesh profile and roughing operations', () => {
  const engine = new UniversalEngine();
  const operations = engine.listOperations({ sourceType: 'mesh' });
  assert.ok(operations.some(operation => operation.id === 'mesh-profile'));
  assert.ok(operations.some(operation => operation.id === 'mesh-waterline-roughing'));
  assert.ok(operations.some(operation => operation.id === 'mesh-raster-finishing'));
});

test('UniversalEngine: bitmap operations do not expose trace as a machining operation', () => {
  const engine = new UniversalEngine();
  const operations = engine.listOperations({ sourceType: 'bitmap' });
  assert.ok(!operations.some(operation => operation.id === 'bitmap-trace'));
});
