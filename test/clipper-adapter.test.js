import test from 'node:test';
import assert from 'node:assert/strict';
import { ClipperAdapter } from '../adapters/ClipperAdapter.js';

function makeSquareClipper(size) {
  const ca = new ClipperAdapter();
  const scale = ca.mmToClipperScale;
  const h = size / 2;
  return [
    { X: Math.round(-h * scale), Y: Math.round(-h * scale) },
    { X: Math.round(h * scale), Y: Math.round(-h * scale) },
    { X: Math.round(h * scale), Y: Math.round(h * scale) },
    { X: Math.round(-h * scale), Y: Math.round(h * scale) },
  ];
}

function camPathBounds(camPaths) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const cp of camPaths) {
    for (const pt of cp.path) {
      if (pt.X < minX) minX = pt.X;
      if (pt.Y < minY) minY = pt.Y;
      if (pt.X > maxX) maxX = pt.X;
      if (pt.Y > maxY) maxY = pt.Y;
    }
  }
  return { minX, minY, maxX, maxY, width: (maxX - minX), height: (maxY - minY) };
}

test('ClipperAdapter: offset 100x100 square +10mm → ~120x120', () => {
  const ca = new ClipperAdapter();
  const scale = ca.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = ca.offset(geo, 10 * scale);
  assert.ok(result.length > 0);
  const b = camPathBounds([{ path: result[0], safeToClose: true }]);
  const mmW = b.width / scale;
  assert.ok(Math.abs(mmW - 120) < 2, `Expected width ~120mm, got ${mmW}mm`);
});

test('ClipperAdapter: offset 100x100 square -10mm → ~80x80', () => {
  const ca = new ClipperAdapter();
  const scale = ca.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = ca.offset(geo, -10 * scale);
  assert.ok(result.length > 0);
  const b = camPathBounds([{ path: result[0], safeToClose: true }]);
  const mmW = b.width / scale;
  assert.ok(Math.abs(mmW - 80) < 2, `Expected width ~80mm, got ${mmW}mm`);
});

test('ClipperAdapter: offset by 0 returns same size', () => {
  const ca = new ClipperAdapter();
  const scale = ca.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = ca.offset(geo, 0);
  assert.ok(result.length > 0);
  const b = camPathBounds([{ path: result[0], safeToClose: true }]);
  const mmW = b.width / scale;
  assert.ok(Math.abs(mmW - 100) < 1);
});

test('ClipperAdapter: offset negative collapses small shape', () => {
  const ca = new ClipperAdapter();
  const scale = ca.mmToClipperScale;
  const geo = [makeSquareClipper(10)];
  const result = ca.offset(geo, -10 * scale);
  assert.equal(result.length, 0);
});

test('ClipperAdapter: union two overlapping squares', () => {
  const ca = new ClipperAdapter();
  const scale = ca.mmToClipperScale;
  const s1 = makeSquareClipper(100);
  const s2 = makeSquareClipper(100).map(p => ({ X: p.X + 50 * scale, Y: p.Y }));
  const result = ca.union([s1], [s2]);
  assert.ok(result.length > 0);
  const b = camPathBounds([{ path: result[0], safeToClose: true }]);
  assert.ok(b.width > 100 * scale);
});

test('ClipperAdapter: intersection', () => {
  const ca = new ClipperAdapter();
  const scale = ca.mmToClipperScale;
  const s1 = makeSquareClipper(100);
  const s2 = makeSquareClipper(100).map(p => ({ X: p.X + 50 * scale, Y: p.Y }));
  const result = ca.intersection([s1], [s2]);
  assert.ok(result.length > 0);
  const b = camPathBounds([{ path: result[0], safeToClose: true }]);
  const mmW = b.width / scale;
  assert.ok(mmW > 40 && mmW < 60, `Expected width ~50mm, got ${mmW}mm`);
});

test('ClipperAdapter: difference', () => {
  const ca = new ClipperAdapter();
  const scale = ca.mmToClipperScale;
  const s1 = makeSquareClipper(100);
  const s2 = makeSquareClipper(50);
  const result = ca.diff([s1], [s2]);
  assert.ok(result.length > 0);
});

test('ClipperAdapter: area positive for CCW square', () => {
  const ca = new ClipperAdapter();
  const result = makeSquareClipper(100);
  const area = ca.area(result);
  assert.ok(area > 0);
  assert.ok(area >= 99 * ca.mmToClipperScale * ca.mmToClipperScale);
});

test('ClipperAdapter: pointInPolygon', () => {
  const ca = new ClipperAdapter();
  const C = ca.C;
  const sq = makeSquareClipper(100);
  const inside = ca.pointInPolygon(new C.IntPoint(0, 0), sq);
  assert.notEqual(inside, 0);
  const outside = ca.pointInPolygon(new C.IntPoint(9999999999, 9999999999), sq);
  assert.equal(outside, 0);
});

test('ClipperAdapter: clipperBounds', () => {
  const ca = new ClipperAdapter();
  const scale = ca.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const b = ca.clipperBounds(geo);
  assert.equal(b.minX, -50 * scale);
  assert.equal(b.maxX, 50 * scale);
});

test('ClipperAdapter: simplify', () => {
  const ca = new ClipperAdapter();
  const C = ca.C;
  const s1 = makeSquareClipper(100);
  const s2 = makeSquareClipper(100).map(p => ({ X: p.X + 50 * ca.mmToClipperScale, Y: p.Y }));
  const result = ca.simplify([s1, s2]);
  assert.ok(result.length >= 1);
});

test('ClipperAdapter: clipperPathsToCPaths returns null without Module', () => {
  const ca = new ClipperAdapter();
  const result = ca.clipperPathsToCPaths([], []);
  assert.equal(result[0], null);
});
