export class ClipperAdapter {
  constructor() {
    this._lib = null;
    this.inchToClipperScale = 1270000000;
    this.mmToClipperScale = 1270000000 / 25.4;
    this.clipperToCppScale = 1 / 128;
    this.cleanPolyDist = 100;
    this.arcTolerance = 10000;
  }

  get heapU32() {
    if (typeof HEAPU32 !== 'undefined') return HEAPU32;
    if (typeof Module !== 'undefined' && Module.HEAPU32) return Module.HEAPU32;
    throw new Error('HEAPU32 not available');
  }

  get C() {
    if (this._lib) return this._lib;
    if (typeof ClipperLib !== 'undefined') {
      this._lib = ClipperLib;
      return this._lib;
    }
    throw new Error('ClipperLib not loaded');
  }

  offset(paths, amount, joinType, endType) {
    const C = this.C;
    if (joinType === undefined) joinType = C.JoinType.jtRound;
    if (endType === undefined) endType = C.EndType.etClosedPolygon;
    if (joinType === C.JoinType.jtSquare) joinType = C.JoinType.jtMiter;
    else if (joinType === C.JoinType.jtMiter) joinType = C.JoinType.jtSquare;
    const co = new C.ClipperOffset(2, this.arcTolerance);
    co.AddPaths(paths, joinType, endType);
    const offsetted = [];
    co.Execute(offsetted, amount);
    return offsetted;
  }

  clip(paths1, paths2, clipType) {
    const C = this.C;
    const cl = new C.Clipper();
    cl.AddPaths(paths1, C.PolyType.ptSubject, true);
    cl.AddPaths(paths2, C.PolyType.ptClip, true);
    const result = [];
    cl.Execute(clipType, result, C.PolyFillType.pftEvenOdd, C.PolyFillType.pftEvenOdd);
    return result;
  }

  union(paths1, paths2) {
    return this.clip(paths1, paths2, this.C.ClipType.ctUnion);
  }

  diff(paths1, paths2) {
    return this.clip(paths1, paths2, this.C.ClipType.ctDifference);
  }

  xor(paths1, paths2) {
    return this.clip(paths1, paths2, this.C.ClipType.ctXor);
  }

  intersection(paths1, paths2) {
    const result = [];
    const cl = new this.C.Clipper();
    cl.AddPaths(paths1, this.C.PolyType.ptSubject, true);
    cl.AddPaths(paths2, this.C.PolyType.ptClip, true);
    const polyTree = new this.C.PolyTree();
    cl.Execute(this.C.ClipType.ctIntersection, polyTree,
      this.C.PolyFillType.pftEvenOdd, this.C.PolyFillType.pftEvenOdd);
    const addPolyNode = (node) => {
      const contour = node.Contour();
      if (contour.length) result.push(contour);
      for (let i = 0; i < node.ChildCount(); i++)
        addPolyNode(node.Childs()[i]);
    };
    addPolyNode(polyTree);
    return result;
  }

  simplify(paths, fillType) {
    const C = this.C;
    const ft = fillType || C.PolyFillType.pftEvenOdd;
    return C.Clipper.SimplifyPolygons(paths, ft);
  }

  clean(paths, distance) {
    const C = this.C;
    return C.Clipper.CleanPolygons(paths, distance || this.cleanPolyDist);
  }

  clipperBounds(paths) {
    let minX = Number.MAX_VALUE, minY = Number.MAX_VALUE;
    let maxX = -Number.MAX_VALUE, maxY = -Number.MAX_VALUE;
    for (const path of paths) {
      for (const pt of path) {
        if (pt.X < minX) minX = pt.X;
        if (pt.Y < minY) minY = pt.Y;
        if (pt.X > maxX) maxX = pt.X;
        if (pt.Y > maxY) maxY = pt.Y;
      }
    }
    return { minX, minY, maxX, maxY };
  }

  area(path) {
    return this.C.Clipper.Area(path);
  }

  orientation(path) {
    return this.C.Clipper.Orientation(path);
  }

  pointInPolygon(pt, path) {
    return this.C.Clipper.PointInPolygon(pt, path);
  }

  rawPathsToClipperPaths(rawPaths, transform) {
    const result = rawPaths.map(p => {
      const path = [];
      for (let i = 0; i < p.length; i += 2) {
        path.push({
          X: (transform[0] * p[i] + transform[2] * p[i + 1] + transform[4]) * this.mmToClipperScale,
          Y: (transform[1] * p[i] + transform[3] * p[i + 1] + transform[5]) * this.mmToClipperScale,
        });
      }
      return path;
    });
    const hasClosed = rawPaths.some(p =>
      p.length >= 4 && p[0] === p[p.length - 2] && p[1] === p[p.length - 1]);
    if (hasClosed) {
      return this.C.Clipper.CleanPolygons(
        this.C.Clipper.SimplifyPolygons(result, this.C.PolyFillType.pftEvenOdd),
        this.cleanPolyDist);
    }
    return result;
  }

  clipperPathsToCPaths(memoryBlocks, clipperPaths) {
    if (typeof Module === 'undefined') return [null, 0, null];
    const heapU32 = this.heapU32;
    const doubleSize = 8;
    const cPaths = Module._malloc(clipperPaths.length * 4);
    memoryBlocks.push(cPaths);
    const cPathsBase = cPaths >> 2;
    const cPathSizes = Module._malloc(clipperPaths.length * 4);
    memoryBlocks.push(cPathSizes);
    const cPathSizesBase = cPathSizes >> 2;
    for (let i = 0; i < clipperPaths.length; ++i) {
      const clipperPath = clipperPaths[i];
      let cPath = Module._malloc(clipperPath.length * 2 * doubleSize + 4);
      memoryBlocks.push(cPath);
      if (cPath & 4) cPath += 4;
      const pathArray = new Float64Array(heapU32.buffer, heapU32.byteOffset + cPath);
      for (let j = 0; j < clipperPath.length; ++j) {
        const point = clipperPath[j];
        pathArray[j * 2] = point.X * this.clipperToCppScale;
        pathArray[j * 2 + 1] = point.Y * this.clipperToCppScale;
      }
      heapU32[cPathsBase + i] = cPath;
      heapU32[cPathSizesBase + i] = clipperPath.length;
    }
    return [cPaths, clipperPaths.length, cPathSizes];
  }

  cPathsToClipperPaths(memoryBlocks, cPathsRef, cNumPathsRef, cPathSizesRef) {
    const heapU32 = this.heapU32;
    const cPaths = heapU32[cPathsRef >> 2];
    memoryBlocks.push(cPaths);
    const cPathsBase = cPaths >> 2;
    const cNumPaths = heapU32[cNumPathsRef >> 2];
    const cPathSizes = heapU32[cPathSizesRef >> 2];
    memoryBlocks.push(cPathSizes);
    const cPathSizesBase = cPathSizes >> 2;
    const clipperPaths = [];
    for (let i = 0; i < cNumPaths; ++i) {
      const pathSize = heapU32[cPathSizesBase + i];
      let cPath = heapU32[cPathsBase + i];
      memoryBlocks.push(cPath);
      if (cPath & 4) cPath += 4;
      const pathArray = new Float64Array(heapU32.buffer, heapU32.byteOffset + cPath);
      const clipperPath = [];
      clipperPaths.push(clipperPath);
      for (let j = 0; j < pathSize; ++j)
        clipperPath.push({
          X: pathArray[j * 2] / this.clipperToCppScale,
          Y: pathArray[j * 2 + 1] / this.clipperToCppScale,
        });
    }
    return clipperPaths;
  }

  cPathsToCamPaths(memoryBlocks, cPathsRef, cNumPathsRef, cPathSizesRef) {
    const heapU32 = this.heapU32;
    const cPaths = heapU32[cPathsRef >> 2];
    memoryBlocks.push(cPaths);
    const cPathsBase = cPaths >> 2;
    const cNumPaths = heapU32[cNumPathsRef >> 2];
    const cPathSizes = heapU32[cPathSizesRef >> 2];
    memoryBlocks.push(cPathSizes);
    const cPathSizesBase = cPathSizes >> 2;
    const convertedPaths = [];
    for (let i = 0; i < cNumPaths; ++i) {
      const pathSize = heapU32[cPathSizesBase + i];
      let cPath = heapU32[cPathsBase + i];
      memoryBlocks.push(cPath);
      if (cPath & 4) cPath += 4;
      const pathArray = new Float64Array(heapU32.buffer, heapU32.byteOffset + cPath);
      const convertedPath = [];
      convertedPaths.push({ path: convertedPath, safeToClose: false });
      for (let j = 0; j < pathSize; ++j)
        convertedPath.push({
          X: pathArray[j * 3] / this.clipperToCppScale,
          Y: pathArray[j * 3 + 1] / this.clipperToCppScale,
          Z: pathArray[j * 3 + 2] / this.clipperToCppScale,
        });
    }
    return convertedPaths;
  }
}
