import { ClipperAdapter } from '../adapters/ClipperAdapter.js';
import { CamCore } from '../core/CamCore.js';
import { VectorOperation } from '../operations/VectorOperation.js';
import { PocketOperation } from '../operations/PocketOperation.js';
import { RasterFillOperation } from '../operations/RasterFillOperation.js';
import { VCarveOperation } from '../operations/VCarveOperation.js';
import { WavyOperation } from '../operations/WavyOperation.js';
import { HalftoneOperation } from '../operations/HalftoneOperation.js';
import { HeightmapOperation } from '../operations/HeightmapOperation.js';
import { LaserOperation } from '../operations/LaserOperation.js';
import { GCodeWriter } from '../io/GCodeWriter.js';

export class Engine {
  constructor() {
    this.clipper = new ClipperAdapter();
    this.cam = new CamCore(this.clipper);
    this.vectorOp = new VectorOperation();
    this.pocketOp = new PocketOperation();
    this.rasterFillOp = new RasterFillOperation();
    this.vCarveOp = new VCarveOperation();
    this.laserOp = new LaserOperation();
    this.wavyOp = new WavyOperation();
    this.halftoneOp = new HalftoneOperation();
    this.heightmapOp = new HeightmapOperation();
  }

  cut(geometry, openGeometry, climb) {
    return this.cam.cut(geometry, openGeometry, climb);
  }

  pocket(geometry, cutterDia, stepover, climb) {
    return this.cam.pocket(geometry, cutterDia, stepover, climb);
  }

  insideOutside(geometry, cutterDia, isInside, width, stepover, climb, allowRecutInBounds) {
    return this.cam.insideOutside(geometry, cutterDia, isInside, width, stepover, climb, allowRecutInBounds);
  }

  fillPath(geometry, lineDistance, angle) {
    return this.cam.fillPath(geometry, lineDistance, angle);
  }

  vCarve(geometry, cutterAngle, passDepth, maxDepth) {
    return this.cam.vCarve(geometry, cutterAngle, passDepth, maxDepth);
  }

  reduceCamPaths(camPaths, minDist) {
    this.cam.reduceCamPaths(camPaths, minDist);
  }

  separateTabs(cutterPath, tabGeometry) {
    return this.laserOp.separateTabsOnPath(cutterPath, tabGeometry);
  }
}
