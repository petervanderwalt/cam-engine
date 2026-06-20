import test from 'node:test';
import assert from 'node:assert/strict';
import { Toolpath } from '../types/Toolpath.js';
import { Path } from '../types/Path.js';

test('Toolpath: create and add paths', () => {
  const tp = new Toolpath('test', {});
  const p = new Path([{ x: 0, y: 0 }, { x: 1, y: 1 }], false);
  tp.addPath(p, 0);
  assert.equal(tp.paths.length, 1);
  assert.equal(tp.zLevels.length, 1);
  assert.equal(tp.zLevels[0], 0);
});

test('Toolpath: addPath deduplicates zLevels', () => {
  const tp = new Toolpath('test', {});
  tp.addPath(new Path([{ x: 0, y: 0 }], false), 1);
  tp.addPath(new Path([{ x: 1, y: 1 }], false), 1);
  tp.addPath(new Path([{ x: 2, y: 2 }], false), 2);
  assert.equal(tp.zLevels.length, 2);
  assert.ok(tp.zLevels.includes(1));
  assert.ok(tp.zLevels.includes(2));
});

test('Toolpath: computeBounds single path', () => {
  const tp = new Toolpath('test', {});
  const p = new Path([{ x: 10, y: 20, z: 0 }, { x: 30, y: 40, z: -5 }], false);
  tp.addPath(p, 0);
  const b = tp.computeBounds();
  assert.equal(b.minX, 10);
  assert.equal(b.minY, 20);
  assert.equal(b.maxX, 30);
  assert.equal(b.maxY, 40);
  assert.equal(b.minZ, -5);
  assert.equal(b.maxZ, 0);
});

test('Toolpath: computeBounds multiple paths', () => {
  const tp = new Toolpath('test', {});
  tp.addPath(new Path([{ x: 0, y: 0, z: 0 }, { x: 10, y: 10, z: 0 }], false), 0);
  tp.addPath(new Path([{ x: 5, y: 5, z: -2 }, { x: 20, y: 20, z: -2 }], false), 1);
  const b = tp.computeBounds();
  assert.equal(b.minX, 0);
  assert.equal(b.minY, 0);
  assert.equal(b.maxX, 20);
  assert.equal(b.maxY, 20);
  assert.equal(b.minZ, -2);
  assert.equal(b.maxZ, 0);
});

test('Toolpath: computeBounds empty returns null', () => {
  const tp = new Toolpath('test', {});
  assert.equal(tp.computeBounds(), null);
});

test('Toolpath: totalCutDistance straight line', () => {
  const tp = new Toolpath('test', {});
  const p = new Path([{ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 }], false);
  tp.addPath(p, 0);
  assert.equal(tp.totalCutDistance, 5);
});

test('Toolpath: totalCutDistance 3D diagonal', () => {
  const tp = new Toolpath('test', {});
  const p = new Path([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: -1 }], false);
  tp.addPath(p, 0);
  const dist = tp.totalCutDistance;
  const expected = 1 + Math.sqrt(1 + 1);
  assert.ok(Math.abs(dist - expected) < 0.001);
});

test('Toolpath: addRapidMove', () => {
  const tp = new Toolpath('test', {});
  tp.addRapidMove({ x: 0, y: 0 }, { x: 10, y: 10 });
  assert.equal(tp.rapidMoves.length, 1);
  assert.equal(tp.rapidMoves[0].from.x, 0);
  assert.equal(tp.rapidMoves[0].to.x, 10);
});

test('Toolpath: toJSON roundtrip', () => {
  const tp = new Toolpath('vector', { depth: -1 });
  const p = new Path([{ x: 1, y: 2, z: 0 }, { x: 3, y: 4, z: -1 }], true);
  tp.addPath(p, 0);
  tp.addRapidMove({ x: 0, y: 0 }, { x: 10, y: 10 });
  tp.computeBounds();
  const json = tp.toJSON();
  assert.equal(json.operationType, 'vector');
  assert.equal(json.paths.length, 1);
  assert.equal(json.paths[0].points.length, 2);
  assert.equal(json.paths[0].closed, true);
  assert.equal(json.rapidMoves.length, 1);
  assert.ok(json.bounds !== null);
});

test('Toolpath: merge multiple toolpaths', () => {
  const tp1 = new Toolpath('op1', {});
  tp1.addPath(new Path([{ x: 0, y: 0 }], false), 0);
  const tp2 = new Toolpath('op2', {});
  tp2.addPath(new Path([{ x: 10, y: 10 }], false), 0);
  const merged = Toolpath.merge([tp1, tp2]);
  assert.equal(merged.operationType, 'merged');
  assert.equal(merged.paths.length, 2);
});

test('Toolpath: metadata persists', () => {
  const tp = new Toolpath('test', {});
  tp.metadata.holeCount = 5;
  tp.metadata.laserMode = 'raster';
  assert.equal(tp.metadata.holeCount, 5);
  assert.equal(tp.metadata.laserMode, 'raster');
});

test('Toolpath: operationType and config stored', () => {
  const tp = new Toolpath('pocket', { strategy: 'raster', stepover: 0.3 });
  assert.equal(tp.operationType, 'pocket');
  assert.equal(tp.config.strategy, 'raster');
  assert.equal(tp.config.stepover, 0.3);
});

test('Toolpath: empty paths produce zero distance', () => {
  const tp = new Toolpath('test', {});
  assert.equal(tp.totalCutDistance, 0);
});

test('Toolpath: applyTabs raises Z near requested coordinates', () => {
  const tp = new Toolpath('test', {});
  tp.addPath(new Path([
    { x: 0, y: 0, z: -3 },
    { x: 10, y: 0, z: -3 }
  ], false), 0);
  tp.applyTabs([{ x: 5, y: 0, width: 2, height: 2 }], { tolerance: 0.5 });
  const zValues = tp.paths[0].points.map(point => point.z);
  assert.ok(zValues.includes(-1));
  assert.equal(tp.metadata.tabs.length, 1);
});
