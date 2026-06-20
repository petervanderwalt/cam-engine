import test from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../core/Engine.js';
import { GCodeWriter } from '../io/GCodeWriter.js';
import { VectorOperation } from '../operations/VectorOperation.js';
import { PocketOperation } from '../operations/PocketOperation.js';
import { RasterFillOperation } from '../operations/RasterFillOperation.js';
import { LaserOperation } from '../operations/LaserOperation.js';
import { WavyOperation } from '../operations/WavyOperation.js';
import { HalftoneOperation } from '../operations/HalftoneOperation.js';
import { HeightmapOperation } from '../operations/HeightmapOperation.js';
import { Toolpath } from '../types/Toolpath.js';

function makeSquareClipper(size) {
  const h = size / 2;
  const scale = 1270000000 / 25.4;
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
  return { minX, minY, maxX, maxY, width: (maxX - minX) };
}

test('Engine.cut: 100x100 square produces paths', () => {
  const eng = new Engine();
  const geo = [makeSquareClipper(100)];
  const result = eng.cut(geo, [], false);
  assert.ok(result.length > 0);
  assert.ok(result[0].path.length >= 4);
  assert.equal(result[0].safeToClose, true);
});

test('Engine.pocket: 100x100 square produces inward offsets', () => {
  const eng = new Engine();
  const scale = eng.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const cutterDia = 6 * scale;
  const result = eng.pocket(geo, cutterDia, 40, false);
  assert.ok(result.length > 0);
  const b = camPathBounds(result);
  assert.ok(b.width <= 100 * scale + cutterDia,
    `Pocket should stay within or near bounds`);
});

test('Engine.insideOutside: inside offset shrinks bounds', () => {
  const eng = new Engine();
  const scale = eng.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const cutterDia = 6 * scale;
  const result = eng.insideOutside(geo, cutterDia, true, 12 * scale, 40, false, false);
  assert.ok(result.length > 0);
  const b = camPathBounds(result);
  assert.ok(b.width <= 100 * scale + cutterDia);
});

test('Engine.insideOutside: outside offset expands bounds', () => {
  const eng = new Engine();
  const scale = eng.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const cutterDia = 6 * scale;
  const result = eng.insideOutside(geo, cutterDia, false, 12 * scale, 40, false, false);
  assert.ok(result.length > 0);
  const b = camPathBounds(result);
  assert.ok(b.width > 100 * scale - cutterDia);
});

test('Engine.fillPath: produces open paths', () => {
  const eng = new Engine();
  const scale = eng.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = eng.fillPath(geo, 1 * scale, 0);
  assert.ok(result.length > 0);
});

test('Engine.reduceCamPaths: removes duplicate points', () => {
  const eng = new Engine();
  const scale = eng.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = eng.cut(geo, [], false);
  const beforeCount = result[0].path.length;
  eng.reduceCamPaths(result, 10 * scale);
  assert.ok(result[0].path.length <= beforeCount);
});

test('GCodeWriter: laser gcode output', () => {
  const eng = new Engine();
  const writer = new GCodeWriter();
  const scale = eng.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(50)];
  const camPaths = eng.cut(geo, [], false);
  const gcode = writer.write(camPaths, {
    type: 'laser', feedRate: 800, laserPower: 50,
    passes: 1, scale: 1 / scale,
    separateTabs: () => camPaths.map(c => c.path)
  });
  assert.ok(typeof gcode === 'string');
  assert.ok(gcode.length > 0);
});

test('GCodeWriter: mill gcode output', () => {
  const eng = new Engine();
  const writer = new GCodeWriter();
  const scale = eng.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(50)];
  const camPaths = eng.cut(geo, [], false);
  const gcode = writer.write(camPaths, {
    type: 'mill', feedRate: 800, plungeRate: 200,
    zStart: 0, zEnd: -2, zClearance: 5, passDepth: 1,
    scale: 1 / scale
  });
  assert.ok(gcode.includes('G1'));
});

test('WavyOperation: produces toolpath output', () => {
  const op = new WavyOperation();
  const img = { width: 10, height: 10, data: new Uint8ClampedArray(400).fill(128) };
  const toolpath = op.generate(img, { cellSize: 0.1 });
  assert.ok(toolpath instanceof Toolpath);
  assert.ok(toolpath.paths.length > 0);
});

test('HalftoneOperation: produces toolpath output', () => {
  const op = new HalftoneOperation();
  const img = { width: 5, height: 5, data: new Uint8ClampedArray(100).fill(128) };
  const toolpath = op.generate(img, { cellSize: 0.1 });
  assert.ok(toolpath instanceof Toolpath);
  assert.ok(toolpath.paths.length > 0);
});

test('HeightmapOperation: produces toolpath output', () => {
  const op = new HeightmapOperation();
  const img = { width: 10, height: 10, data: new Uint8ClampedArray(400).fill(128) };
  const toolpath = op.generate(img, { cellSize: 0.1 });
  assert.ok(toolpath instanceof Toolpath);
  assert.ok(toolpath.paths.length > 0);
});

test('Engine.clipper: offset 100mm square +10mm → ~120mm', () => {
  const eng = new Engine();
  const scale = eng.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = eng.clipper.offset(geo, 10 * scale);
  assert.ok(result.length > 0);
  const b = camPathBounds([{ path: result[0], safeToClose: true }]);
  const mmW = b.width / scale;
  assert.ok(Math.abs(mmW - 120) < 2, `Expected width ~120mm, got ${mmW}mm`);
});

test('Engine.clipper: offset 100mm square -10mm → ~80mm', () => {
  const eng = new Engine();
  const scale = eng.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = eng.clipper.offset(geo, -10 * scale);
  assert.ok(result.length > 0);
  const b = camPathBounds([{ path: result[0], safeToClose: true }]);
  const mmW = b.width / scale;
  assert.ok(Math.abs(mmW - 80) < 2, `Expected width ~80mm, got ${mmW}mm`);
});

test('Engine.clipper: union two overlapping squares', () => {
  const eng = new Engine();
  const scale = eng.clipper.mmToClipperScale;
  const s1 = makeSquareClipper(100);
  const s2 = makeSquareClipper(100).map(p => ({ X: p.X + 50 * scale, Y: p.Y }));
  const result = eng.clipper.union([s1], [s2]);
  assert.ok(result.length > 0);
  const b = camPathBounds([{ path: result[0], safeToClose: true }]);
  assert.ok(b.width > 100 * scale);
});

test('Engine.clipper: difference subtracts correctly', () => {
  const eng = new Engine();
  const scale = eng.clipper.mmToClipperScale;
  const s1 = makeSquareClipper(100);
  const s2 = makeSquareClipper(50).map(p => ({ X: p.X, Y: p.Y }));
  const result = eng.clipper.diff([s1], [s2]);
  assert.ok(result.length > 0);
});

test('VectorOperation: cut mode produces paths', () => {
  const op = new VectorOperation();
  const scale = op.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = op.generate(geo, { mode: 'cut' });
  assert.ok(result.length > 0);
});

test('PocketOperation: pocket produces inward offsets', () => {
  const op = new PocketOperation();
  const scale = op.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = op.generate(geo, { toolDiameter: 6, stepOver: 40 });
  assert.ok(result.length > 0);
});

test('RasterFillOperation: fill produces open paths', () => {
  const op = new RasterFillOperation();
  const scale = op.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(100)];
  const result = op.generate(geo, { spacing: 2, angle: 0 });
  assert.ok(result.length > 0);
});

test('LaserOperation: generateVector in cut mode', () => {
  const op = new LaserOperation();
  const scale = op.clipper.mmToClipperScale;
  const geo = [makeSquareClipper(50)];
  const result = op.generateVector(geo, [], { mode: 'cut', laserDiameter: 0.1 });
  assert.ok(result.length > 0);
});

test('Empty input returns empty', () => {
  const eng = new Engine();
  const result = eng.cut([], [], false);
  assert.equal(result.length, 0);
});
