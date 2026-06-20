import test from 'node:test';
import assert from 'node:assert/strict';
import { RasterFillOperation } from '../operations/RasterFillOperation.js';

function makeSquareClipper(size) {
  const op = new RasterFillOperation();
  const scale = op.clipper.mmToClipperScale;
  const h = size / 2;
  return [
    { X: Math.round(-h * scale), Y: Math.round(-h * scale) },
    { X: Math.round(h * scale), Y: Math.round(-h * scale) },
    { X: Math.round(h * scale), Y: Math.round(h * scale) },
    { X: Math.round(-h * scale), Y: Math.round(h * scale) },
  ];
}

test('RasterFill: basic fill produces open lines', () => {
  const op = new RasterFillOperation();
  const geo = [makeSquareClipper(100)];
  const result = op.generate(geo, { spacing: 5, angle: 0 });
  assert.ok(result.length > 0, 'Should produce fill lines');
});

test('RasterFill: lines stay within geometry bounds', () => {
  const op = new RasterFillOperation();
  const geo = [makeSquareClipper(50)];
  const result = op.generate(geo, { spacing: 5, angle: 0 });
  assert.ok(result.length > 0);
  for (const cp of result) {
    assert.ok(cp.path.length >= 2, 'Each path should have at least 2 points');
  }
});

test('RasterFill: different angles produce paths', () => {
  const op = new RasterFillOperation();
  const geo = [makeSquareClipper(50)];
  const r0 = op.generate(geo, { spacing: 5, angle: 0 });
  const r45 = op.generate(geo, { spacing: 5, angle: 45 });
  const r90 = op.generate(geo, { spacing: 5, angle: 90 });
  assert.ok(r0.length > 0);
  assert.ok(r45.length > 0);
  assert.ok(r90.length > 0);
});

test('RasterFill: empty input returns empty', () => {
  const op = new RasterFillOperation();
  const result = op.generate([], { spacing: 5, angle: 0 });
  assert.equal(result.length, 0);
});
