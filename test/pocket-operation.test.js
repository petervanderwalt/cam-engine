import test from 'node:test';
import assert from 'node:assert/strict';
import { PocketOperation } from '../operations/PocketOperation.js';

function makeSquareClipper(size) {
  const op = new PocketOperation();
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

function clipperToMm(value, scale) {
  return value / scale;
}

test('Pocket: concentric produces inward offsets', () => {
  const op = new PocketOperation();
  const geo = [makeSquareClipper(100)];
  const result = op.generate(geo, { toolDiameter: 6, stepOver: 40 });
  assert.ok(result.length > 0, 'Should produce paths');
  const b = camPathBounds(result);
  const scale = op.clipper.mmToClipperScale;
  const mmW = b.width / scale;
  assert.ok(mmW <= 100, `Pocket width ${mmW}mm should stay within 100mm`);
  assert.ok(mmW > 10, `Pocket should not collapse entirely`);
});

test('Pocket: simple square pocket keeps the expected first offset loop', () => {
  const op = new PocketOperation();
  const scale = op.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = op.generate(geo, { toolDiameter: 6, stepOver: 40 });
  assert.equal(result.length, 1);
  const width = clipperToMm(camPathBounds([result[0]]).width, scale);
  assert.ok(Math.abs(width - 94) < 0.01, `Expected first pocket loop width 94mm, got ${width}mm`);
});

test('Pocket: stepover = 1 produces fewest paths', () => {
  const op = new PocketOperation();
  const geo = [makeSquareClipper(100)];
  const large = op.generate(geo, { toolDiameter: 6, stepOver: 80 });
  const small = op.generate(geo, { toolDiameter: 6, stepOver: 20 });
  assert.ok(large.length <= small.length,
    'Larger stepover should produce fewer paths');
});

test('Pocket: inside mode produces paths', () => {
  const op = new PocketOperation();
  const geo = [makeSquareClipper(100)];
  const result = op.generate(geo, { mode: 'inside', toolDiameter: 6, stepOver: 40, cutWidth: 12 });
  assert.ok(result.length > 0);
});

test('Pocket: outside mode produces paths', () => {
  const op = new PocketOperation();
  const geo = [makeSquareClipper(100)];
  const result = op.generate(geo, { mode: 'outside', toolDiameter: 6, stepOver: 40, cutWidth: 12 });
  assert.ok(result.length > 0);
});

test('Pocket: empty input produces empty output', () => {
  const op = new PocketOperation();
  const result = op.generate([], { toolDiameter: 6, stepOver: 40 });
  assert.equal(result.length, 0);
});
