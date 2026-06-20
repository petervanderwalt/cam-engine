import test from 'node:test';
import assert from 'node:assert/strict';
import { OperationConfig } from '../types/OperationConfig.js';

test('OperationConfig: getTypes returns all types', () => {
  const types = OperationConfig.getTypes();
  assert.ok(Array.isArray(types));
  assert.ok(types.includes('vector'));
  assert.ok(types.includes('pocket'));
  assert.ok(types.includes('vcarve'));
  assert.ok(types.includes('laser'));
  assert.ok(types.length >= 15);
});

test('OperationConfig: getDefaults for vector', () => {
  const def = OperationConfig.getDefaults('vector');
  assert.equal(def.offsetType, 'none');
  assert.equal(def.offsetDistance, 0);
  assert.equal(def.toolDiameter, 3.175);
  assert.equal(def.zDepth, 0);
  assert.equal(def.zStep, 0.5);
  assert.equal(def.zEnd, 0);
  assert.equal(def.passDepth, 0.5);
  assert.deepEqual(def.tabs, []);
});

test('OperationConfig: getDefaults for pocket', () => {
  const def = OperationConfig.getDefaults('pocket');
  assert.equal(def.strategy, 'concentric');
  assert.equal(def.stepover, 0.4);
  assert.equal(def.toolDiameter, 3.175);
  assert.equal(def.zEnd, 0);
});

test('OperationConfig: getDefaults for vcarve', () => {
  const def = OperationConfig.getDefaults('vcarve');
  assert.equal(def.cutterAngle, 90);
  assert.equal(def.maxDepth, 3);
  assert.equal(def.tipDiameter, 0.1);
});

test('OperationConfig: getDefaults for laser', () => {
  const def = OperationConfig.getDefaults('laser');
  assert.equal(def.power, 50);
  assert.equal(def.speed, 1000);
  assert.equal(def.mode, 'vector');
});

test('OperationConfig: getDefaults for unknown type', () => {
  const def = OperationConfig.getDefaults('nonexistent');
  assert.deepEqual(def, {});
});

test('OperationConfig: validate passes valid config', () => {
  const result = OperationConfig.validate('vector', { offsetType: 'inside' });
  assert.equal(result.valid, true);
});

test('OperationConfig: validate fails on out of range', () => {
  const result = OperationConfig.validate('vcarve', { cutterAngle: 200 });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test('OperationConfig: validate unknown type', () => {
  const result = OperationConfig.validate('fake', {});
  assert.equal(result.valid, false);
});

test('OperationConfig: validate conditional field (rasterAngle only when raster)', () => {
  const withRaster = OperationConfig.validate('pocket', {
    strategy: 'raster',
    rasterAngle: 45
  });
  assert.equal(withRaster.valid, true);
});

test('OperationConfig: schema has expected structure', () => {
  const schema = OperationConfig.SCHEMA;
  assert.ok(schema.vector);
  assert.ok(schema.vector.offsetType);
  assert.equal(schema.vector.offsetType.type, 'select');
  assert.ok(schema.vector.zDepth);
  assert.equal(schema.vector.zDepth.type, 'number');
});

test('OperationConfig: getTypes list includes all expected', () => {
  const types = OperationConfig.getTypes();
  const expected = [
    'vector', 'pocket', 'rasterFill', 'vcarve',
    'bitmapTrace', 'bitmapRaster', 'halftone', 'wavy', 'heightmap',
    'model3d', 'meshRoughing', 'meshFinishing', 'meshProfile', 'dragKnife',
    'laser', 'texture', 'drill', 'stepdown'
  ];
  for (const e of expected) {
    assert.ok(types.includes(e), `Missing type: ${e}`);
  }
});

test('OperationConfig: defaults for halftone', () => {
  const def = OperationConfig.getDefaults('halftone');
  assert.equal(def.dotSize, 0.5);
  assert.equal(def.dotSpacing, 1);
  assert.equal(def.shape, 'circle');
  assert.equal(def.angle, 45);
});

test('OperationConfig: defaults for drill', () => {
  const def = OperationConfig.getDefaults('drill');
  assert.equal(def.zDepth, -3);
  assert.equal(def.zStep, 1);
  assert.equal(def.mode, 'peck');
});

test('OperationConfig: defaults for mesh profile', () => {
  const def = OperationConfig.getDefaults('meshProfile');
  assert.equal(def.mode, 'outside');
  assert.equal(def.passDepth, 0.5);
  assert.deepEqual(def.tabs, []);
});

test('OperationConfig: defaults for drag knife', () => {
  const def = OperationConfig.getDefaults('dragKnife');
  assert.equal(def.bladeOffset, 0.25);
  assert.equal(def.swivelSegments, 12);
  assert.equal(def.z, 0);
});
