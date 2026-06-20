import test from 'node:test';
import assert from 'node:assert/strict';
import { DragKnifeOperation } from '../operations/DragKnifeOperation.js';

test('DragKnifeOperation: offsets tool center behind the first segment', () => {
  const op = new DragKnifeOperation();
  const toolpath = op.generate([{
    closed: false,
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 }
    ]
  }], { bladeOffset: 2 });
  assert.equal(toolpath.paths.length, 1);
  assert.deepEqual(toolpath.paths[0].points[0], { x: -2, y: 0, z: 0 });
  assert.deepEqual(toolpath.paths[0].points[toolpath.paths[0].points.length - 1], { x: 8, y: 0, z: 0 });
});

test('DragKnifeOperation: inserts swivel points through corners', () => {
  const op = new DragKnifeOperation();
  const toolpath = op.generate([{
    closed: false,
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 }
    ]
  }], { bladeOffset: 2, swivelSegments: 8 });
  const points = toolpath.paths[0].points;
  assert.ok(points.length > 4);
  assert.deepEqual(points[1], { x: 8, y: 0, z: 0 });
  assert.deepEqual(points[points.length - 1], { x: 10, y: 8, z: 0 });
  assert.ok(points.some(point => point.x > 8 && point.y < 0 && point.y > -2));
});

test('DragKnifeOperation: registry-visible closed paths remain single toolpath', () => {
  const op = new DragKnifeOperation();
  const toolpath = op.generate([{
    closed: true,
    points: [
      { x: 0, y: 0, z: 0 },
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 10, z: 0 },
      { x: 0, y: 10, z: 0 }
    ]
  }], { bladeOffset: 1 });
  assert.equal(toolpath.paths.length, 1);
  assert.equal(toolpath.metadata.bladeOffset, 1);
  assert.ok(toolpath.totalCutDistance > 0);
});
