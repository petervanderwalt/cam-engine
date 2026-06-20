import test from 'node:test';
import assert from 'node:assert/strict';
import { LayeredStepdownOperation } from '../operations/LayeredStepdownOperation.js';

function square(size = 20) {
  const h = size / 2;
  return [[
    { X: -h * 10000, Y: -h * 10000 },
    { X: h * 10000, Y: -h * 10000 },
    { X: h * 10000, Y: h * 10000 },
    { X: -h * 10000, Y: h * 10000 }
  ]];
}

test('LayeredStepdownOperation: creates multiple Z levels', () => {
  const op = new LayeredStepdownOperation();
  const toolpath = op.generate(square(20), {
    mode: 'outside',
    toolDiameter: 3.175,
    cutWidth: 3.175,
    zStart: 0,
    zEnd: -2,
    passDepth: 0.5
  });
  assert.equal(toolpath.operationType, 'layered-stepdown');
  assert.ok(toolpath.paths.length > 0);
  assert.deepEqual(toolpath.metadata.levels, [-0.5, -1, -1.5, -2]);
  assert.equal(toolpath.bounds.minZ, -2);
  assert.equal(toolpath.bounds.maxZ, -0.5);
});

test('LayeredStepdownOperation: applies finish pass, spring passes, and tabs', () => {
  const op = new LayeredStepdownOperation();
  const toolpath = op.generate(square(20), {
    mode: 'outside',
    toolDiameter: 3.175,
    cutWidth: 3.175,
    zStart: 0,
    zEnd: -2,
    passDepth: 1,
    finishPassDepth: 0.5,
    springPasses: 1,
    tabs: [{ x: 10, y: 0, width: 3, height: 1 }],
    tabTolerance: 1
  });
  assert.deepEqual(toolpath.metadata.levels, [-1, -1.5, -2, -2]);
  assert.ok(toolpath.paths.some(path => path.points.some(point => point.z === -1)));
  assert.equal(toolpath.metadata.tabs.length, 1);
});
