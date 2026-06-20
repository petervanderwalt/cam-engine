import test from 'node:test';
import assert from 'node:assert/strict';
import { LaserOperation } from '../operations/LaserOperation.js';

function makeSquareClipper(size) {
  const op = new LaserOperation();
  const scale = op.clipper.mmToClipperScale;
  const h = size / 2;
  return [
    { X: Math.round(-h * scale), Y: Math.round(-h * scale) },
    { X: Math.round(h * scale), Y: Math.round(-h * scale) },
    { X: Math.round(h * scale), Y: Math.round(h * scale) },
    { X: Math.round(-h * scale), Y: Math.round(h * scale) },
  ];
}

test('Laser: cut mode produces paths', () => {
  const op = new LaserOperation();
  const geo = [makeSquareClipper(50)];
  const result = op.generateVector(geo, [], { mode: 'cut', laserDiameter: 0.1 });
  assert.ok(result.length > 0);
});

test('Laser: fill mode produces line paths', () => {
  const op = new LaserOperation();
  const scale = op.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(50)];
  const result = op.generateVector(geo, [], {
    mode: 'fill', laserDiameter: 0.1,
    lineDistance: 1, lineAngle: 0
  });
  assert.ok(result.length > 0);
});

test('Laser: inside offset with margin', () => {
  const op = new LaserOperation();
  const scale = op.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(50)];
  const result = op.generateVector(geo, [], {
    mode: 'inside', laserDiameter: 0.1, cutWidth: 1,
    stepOver: 40, margin: 1
  });
  assert.ok(result.length > 0);
});

test('Laser: outside offset with margin', () => {
  const op = new LaserOperation();
  const scale = op.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(50)];
  const result = op.generateVector(geo, [], {
    mode: 'outside', laserDiameter: 0.1, cutWidth: 1,
    stepOver: 40, margin: 1
  });
  assert.ok(result.length > 0);
});

test('Laser: empty input returns empty', () => {
  const op = new LaserOperation();
  const result = op.generateVector([], [], { mode: 'cut' });
  assert.equal(result.length, 0);
});
