import { CamCore } from '../core/CamCore.js';
import { ClipperAdapter } from '../adapters/ClipperAdapter.js';

export class PocketOperation {
  constructor() {
    this.clipper = new ClipperAdapter();
    this.cam = new CamCore(this.clipper);
  }

  generate(inputPaths, config) {
    const geometry = inputPaths.map(p => p instanceof Array ? p : p.points.map(pt => ({ X: Math.round(pt.x * this.clipper.mmToClipperScale), Y: Math.round(pt.y * this.clipper.mmToClipperScale) })));
    const toolDia = (config.toolDiameter || 3.175) * this.clipper.mmToClipperScale;
    const stepover = config.stepOver || 40;
    const climb = config.climb || false;
    if (config.margin) {
      const margin = config.margin * this.clipper.mmToClipperScale;
      for (let i = 0; i < geometry.length; i++)
        geometry[i] = this.clipper.offset([geometry[i]], -margin)[0];
    }
    let camPaths;
    if (config.mode === 'inside') {
      camPaths = this.cam.insideOutside(geometry, toolDia, true,
        (config.cutWidth || 3.175) * this.clipper.mmToClipperScale,
        stepover, config.direction === 'Climb', true);
    } else if (config.mode === 'outside') {
      camPaths = this.cam.insideOutside(geometry, toolDia, false,
        (config.cutWidth || 3.175) * this.clipper.mmToClipperScale,
        stepover, config.direction === 'Climb', true);
    } else if (config.strategy === 'raster') {
      camPaths = this.cam.fillPath(geometry, toolDia * (stepover / 100), config.rasterAngle || 0);
    } else {
      camPaths = this.cam.pocket(geometry, toolDia, stepover, climb);
    }
    this.cam.reduceCamPaths(camPaths, (config.segmentLength || 0.1) * this.clipper.mmToClipperScale);
    return camPaths;
  }
}
