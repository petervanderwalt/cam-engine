import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshWaterlineRoughingOperation } from '../operations/MeshWaterlineRoughingOperation.js';
import { MeshRasterRoughingOperation } from '../operations/MeshRasterRoughingOperation.js';
import { MeshRasterFinishingOperation } from '../operations/MeshRasterFinishingOperation.js';
import { MeshProfileOperation } from '../operations/MeshProfileOperation.js';

function boxMesh(size = 10, height = 5) {
  const s = size;
  const z0 = 0;
  const z1 = -height;
  const v = {
    a: { x: 0, y: 0, z: z0 },
    b: { x: s, y: 0, z: z0 },
    c: { x: s, y: s, z: z0 },
    d: { x: 0, y: s, z: z0 },
    e: { x: 0, y: 0, z: z1 },
    f: { x: s, y: 0, z: z1 },
    g: { x: s, y: s, z: z1 },
    h: { x: 0, y: s, z: z1 }
  };
  return [
    [v.a, v.b, v.c], [v.a, v.c, v.d],
    [v.e, v.g, v.f], [v.e, v.h, v.g],
    [v.a, v.f, v.b], [v.a, v.e, v.f],
    [v.b, v.g, v.c], [v.b, v.f, v.g],
    [v.c, v.h, v.d], [v.c, v.g, v.h],
    [v.d, v.e, v.a], [v.d, v.h, v.e]
  ];
}

function rampMesh(size = 10, depth = 5) {
  return [[
    { x: 0, y: 0, z: 0 },
    { x: size, y: 0, z: -depth },
    { x: size, y: size, z: -depth }
  ], [
    { x: 0, y: 0, z: 0 },
    { x: size, y: size, z: -depth },
    { x: 0, y: size, z: 0 }
  ]];
}

test('MeshWaterlineRoughingOperation: creates closed contour paths', () => {
  const op = new MeshWaterlineRoughingOperation();
  const toolpath = op.generate(boxMesh(), {
    toolDiameter: 1,
    stepover: 1,
    stepdown: 1
  });
  assert.ok(toolpath.paths.length > 0);
  assert.ok(toolpath.paths.every(path => path.closed));
  assert.equal(toolpath.metadata.inputType, 'mesh');
});

test('MeshRasterRoughingOperation: creates open raster paths', () => {
  const op = new MeshRasterRoughingOperation();
  const toolpath = op.generate(boxMesh(), {
    toolDiameter: 1,
    stepover: 1,
    stepdown: 1,
    angle: 0
  });
  assert.ok(toolpath.paths.length > 0);
  assert.ok(toolpath.paths.every(path => !path.closed));
  assert.equal(toolpath.metadata.inputType, 'mesh');
});

test('MeshRasterFinishingOperation: samples varying Z on sloped mesh', () => {
  const op = new MeshRasterFinishingOperation();
  const toolpath = op.generate(rampMesh(), {
    stepover: 2,
    direction: 'x'
  });
  assert.ok(toolpath.paths.length > 0);
  const zValues = toolpath.paths.flatMap(path => path.points.map(point => point.z));
  assert.ok(Math.min(...zValues) < Math.max(...zValues));
});

test('MeshProfileOperation: projects mesh silhouette into stepdown profile cuts', () => {
  const op = new MeshProfileOperation();
  const toolpath = op.generate(boxMesh(), {
    mode: 'outside',
    toolDiameter: 1,
    cutWidth: 1,
    zStart: 0,
    zEnd: -4,
    passDepth: 2
  });
  assert.equal(toolpath.operationType, 'mesh-profile');
  assert.ok(toolpath.paths.length > 0);
  assert.deepEqual(toolpath.metadata.levels, [-2, -4]);
  assert.equal(toolpath.metadata.projected, true);
});
