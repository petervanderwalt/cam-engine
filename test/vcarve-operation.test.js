import test from 'node:test';
import assert from 'node:assert/strict';
import { VCarveOperation } from '../operations/VCarveOperation.js';
import { WASMAdapter } from '../adapters/WASMAdapter.js';

test('VCarveOperation maps negative zEnd to positive maxDepth', () => {
  const op = new VCarveOperation();
  let captured = null;
  op.wasm.vCarve = (...args) => {
    captured = args;
    return [];
  };
  op.generate([
    {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 }
      ]
    }
  ], {
    cutterAngle: 60,
    passDepth: 0.25,
    zEnd: -3
  });
  assert.ok(captured);
  assert.equal(captured[1], 60);
  assert.equal(captured[2], 0.25);
  assert.equal(captured[3], 3);
});

test('WASMAdapter forwards maxDepth to cam-cpp', () => {
  const originalModule = globalThis.Module;
  const buffer = new ArrayBuffer(4096);
  let nextPtr = 128;
  let ccallArgs = null;
  globalThis.Module = {
    _separateTabs() {},
    _vCarve() {},
    _malloc(size) {
      const ptr = nextPtr;
      nextPtr += Math.max(size, 8);
      return ptr;
    },
    _free() {},
    HEAPU32: new Uint32Array(buffer),
    ccall(name, returnType, argTypes, args) {
      ccallArgs = { name, returnType, argTypes, args };
    }
  };
  try {
    const adapter = new WASMAdapter();
    adapter.setClipper({
      clipperToCppScale: 0.5,
      clipperPathsToCPaths(memoryBlocks, clipperPaths) {
        return [11, clipperPaths.length, 22];
      },
      cPathsToCamPaths() {
        return [];
      }
    });
    const result = adapter.vCarve([], 60, 0.25, 3);
    assert.deepEqual(result, []);
    assert.ok(ccallArgs);
    assert.equal(ccallArgs.name, 'vCarve');
    assert.equal(ccallArgs.args.length, 11);
    assert.equal(ccallArgs.args[6], 0.125);
    assert.equal(ccallArgs.args[7], 1.5);
  } finally {
    globalThis.Module = originalModule;
  }
});
