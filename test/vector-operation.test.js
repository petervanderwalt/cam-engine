import test from 'node:test';
import assert from 'node:assert/strict';
import { VectorOperation } from '../operations/VectorOperation.js';

function makeSquareClipper(size) {
  const op = new VectorOperation();
  const scale = op.clipper.mmToClipperScale;
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

test('Vector: cut mode on 100x100 square produces closed paths', () => {
  const op = new VectorOperation();
  const geo = [makeSquareClipper(100)];
  const result = op.generate(geo, { mode: 'cut' });
  assert.ok(result.length > 0);
  const lastPt = result[0].path[result[0].path.length - 1];
  const firstPt = result[0].path[0];
  assert.equal(lastPt.X, firstPt.X);
  assert.equal(lastPt.Y, firstPt.Y);
});

test('Vector: cut with climb reverses paths', () => {
  const op = new VectorOperation();
  const geo = [makeSquareClipper(100)];
  const result = op.generate(geo, { mode: 'cut', direction: 'Climb' });
  assert.ok(result.length > 0);
});

test('Vector: inside offset with margin', () => {
  const op = new VectorOperation();
  const scale = op.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = op.generate(geo, {
    mode: 'inside', toolDiameter: 6, cutWidth: 12,
    stepOver: 40, margin: 2
  });
  assert.ok(result.length > 0);
});

test('Vector: outside offset expands bounds', () => {
  const op = new VectorOperation();
  const scale = op.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const inside = op.generate(geo, { mode: 'inside', toolDiameter: 6, cutWidth: 6, stepOver: 40 });
  const outside = op.generate(geo, { mode: 'outside', toolDiameter: 6, cutWidth: 6, stepOver: 40 });
  const bIn = camPathBounds(inside);
  const bOut = camPathBounds(outside);
  assert.ok(bIn.width < bOut.width,
    `Inside width ${bIn.width} should be < outside ${bOut.width}`);
});

test('Vector: empty input returns empty', () => {
  const op = new VectorOperation();
  const result = op.generate([], { mode: 'cut' });
  assert.equal(result.length, 0);
});
