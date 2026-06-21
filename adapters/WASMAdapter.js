function camCppReady() {
  return typeof Module !== 'undefined' &&
    typeof Module._separateTabs === 'function' &&
    typeof Module._vCarve === 'function';
}

export class WASMAdapter {
  constructor() {
    this._clipper = null;
  }

  setClipper(clipper) {
    this._clipper = clipper;
  }

  isReady() {
    return camCppReady();
  }

  vCarve(paths, cutterAngle, passDepth, onError) {
    if (!camCppReady()) {
      if (onError) onError('cam-cpp WASM module not loaded - V-Carve unavailable');
      return [];
    }
    if (cutterAngle <= 0 || cutterAngle >= 180) return [];
    const clipper = this._clipper;
    const memoryBlocks = [];
    const cGeometry = clipper.clipperPathsToCPaths(memoryBlocks, paths);
    const resultPathsRef = Module._malloc(4);
    const resultNumPathsRef = Module._malloc(4);
    const resultPathSizesRef = Module._malloc(4);
    memoryBlocks.push(resultPathsRef);
    memoryBlocks.push(resultNumPathsRef);
    memoryBlocks.push(resultPathSizesRef);
    const debugArg0 = 0, debugArg1 = 0;
    Module.ccall(
      'vCarve',
      'void', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [
        debugArg0, debugArg1, cGeometry[0], cGeometry[1], cGeometry[2],
        cutterAngle, passDepth * clipper.clipperToCppScale,
        resultPathsRef, resultNumPathsRef, resultPathSizesRef
      ]);
    const result = clipper.cPathsToCamPaths(memoryBlocks, resultPathsRef, resultNumPathsRef, resultPathSizesRef);
    for (let i = 0; i < memoryBlocks.length; ++i)
      Module._free(memoryBlocks[i]);
    return result;
  }

  separateTabs(cutterPath, tabGeometry, onError) {
    if (tabGeometry.length === 0) return [cutterPath];
    if (!camCppReady()) {
      if (onError) onError('cam-cpp WASM module not loaded - cannot process tabs');
      return [cutterPath];
    }
    const clipper = this._clipper;
    const memoryBlocks = [];
    const cCutterPath = clipper.clipperPathsToCPaths(memoryBlocks, [cutterPath]);
    const cTabGeometry = clipper.clipperPathsToCPaths(memoryBlocks, tabGeometry);
    const errorRef = Module._malloc(4);
    const resultPathsRef = Module._malloc(4);
    const resultNumPathsRef = Module._malloc(4);
    const resultPathSizesRef = Module._malloc(4);
    memoryBlocks.push(errorRef);
    memoryBlocks.push(resultPathsRef);
    memoryBlocks.push(resultNumPathsRef);
    memoryBlocks.push(resultPathSizesRef);
    Module.ccall(
      'separateTabs',
      'void', ['number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number', 'number'],
      [cCutterPath[0], cCutterPath[1], cCutterPath[2],
       cTabGeometry[0], cTabGeometry[1], cTabGeometry[2],
       errorRef, resultPathsRef, resultNumPathsRef, resultPathSizesRef]);
    const result = clipper.cPathsToClipperPaths(memoryBlocks, resultPathsRef, resultNumPathsRef, resultPathSizesRef);
    for (let i = 0; i < memoryBlocks.length; ++i)
      Module._free(memoryBlocks[i]);
    return result;
  }
}
