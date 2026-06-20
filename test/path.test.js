import test from 'node:test';
import assert from 'node:assert/strict';
import { Path } from '../types/Path.js';

test('Path: create empty', () => {
  const p = new Path();
  assert.equal(p.length, 0);
  assert.equal(p.closed, false);
});

test('Path: addPoint and length', () => {
  const p = new Path();
  p.addPoint(1, 2);
  p.addPoint(3, 4);
  assert.equal(p.length, 2);
  assert.equal(p.points[0].x, 1);
  assert.equal(p.points[0].y, 2);
  assert.equal(p.points[0].z, 0);
});

test('Path: bounds', () => {
  const p = new Path();
  p.addPoint(-10, -20);
  p.addPoint(30, 40);
  p.addPoint(5, 5);
  const b = p.bounds;
  assert.equal(b.minX, -10);
  assert.equal(b.minY, -20);
  assert.equal(b.maxX, 30);
  assert.equal(b.maxY, 40);
  assert.equal(b.width, 40);
  assert.equal(b.height, 60);
});

test('Path: bounds empty', () => {
  const p = new Path();
  assert.equal(p.bounds, null);
});

test('Path: reverse', () => {
  const p = new Path();
  p.addPoint(1, 2);
  p.addPoint(3, 4);
  p.addPoint(5, 6);
  p.reverse();
  assert.equal(p.points[0].x, 5);
  assert.equal(p.points[1].x, 3);
  assert.equal(p.points[2].x, 1);
});

test('Path: translate', () => {
  const p = new Path();
  p.addPoint(10, 20);
  p.addPoint(30, 40);
  p.translate(5, -5);
  assert.equal(p.points[0].x, 15);
  assert.equal(p.points[0].y, 15);
  assert.equal(p.points[1].x, 35);
  assert.equal(p.points[1].y, 35);
});

test('Path: scale', () => {
  const p = new Path();
  p.addPoint(10, 20);
  p.scale(2);
  assert.equal(p.points[0].x, 20);
  assert.equal(p.points[0].y, 40);
});

test('Path: scale non-uniform', () => {
  const p = new Path();
  p.addPoint(10, 20);
  p.scale(2, 3);
  assert.equal(p.points[0].x, 20);
  assert.equal(p.points[0].y, 60);
});

test('Path: rotate', () => {
  const p = new Path();
  p.addPoint(10, 0);
  p.rotate(Math.PI / 2);
  assert.ok(Math.abs(p.points[0].x) < 0.001);
  assert.ok(Math.abs(p.points[0].y - 10) < 0.001);
});

test('Path: clone', () => {
  const p = new Path();
  p.addPoint(1, 2, 3);
  p.closed = true;
  const c = p.clone();
  assert.equal(c.points[0].x, 1);
  assert.equal(c.points[0].y, 2);
  assert.equal(c.points[0].z, 3);
  assert.equal(c.closed, true);
  c.points[0].x = 999;
  assert.equal(p.points[0].x, 1);
});

test('Path: toClipperPath and fromClipperPath', () => {
  const p = new Path();
  p.addPoint(1, 2);
  p.addPoint(3, 4);
  const cp = p.toClipperPath(10000);
  assert.equal(cp[0].X, 10000);
  assert.equal(cp[0].Y, 20000);
  assert.equal(cp[1].X, 30000);
  assert.equal(cp[1].Y, 40000);
  const back = Path.fromClipperPath(cp, 10000, 5);
  assert.equal(back.points[0].x, 1);
  assert.equal(back.points[0].y, 2);
  assert.equal(back.points[0].z, 5);
  assert.equal(back.closed, true);
});

test('Path: fromArray with objects', () => {
  const p = Path.fromArray([{ x: 1, y: 2 }, { x: 3, y: 4, z: 5 }]);
  assert.equal(p.points[0].x, 1);
  assert.equal(p.points[1].z, 5);
});

test('Path: fromArray with arrays', () => {
  const p = Path.fromArray([[1, 2], [3, 4, 5]]);
  assert.equal(p.points[0].x, 1);
  assert.equal(p.points[1].z, 5);
});

test('Path: closed property', () => {
  const p1 = new Path([{ x: 0, y: 0 }, { x: 1, y: 1 }], true);
  assert.equal(p1.closed, true);
  const p2 = new Path([{ x: 0, y: 0 }, { x: 1, y: 1 }], false);
  assert.equal(p2.closed, false);
});
