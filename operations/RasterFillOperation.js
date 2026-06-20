import { CamCore } from '../core/CamCore.js';
import { ClipperAdapter } from '../adapters/ClipperAdapter.js';

export class RasterFillOperation {
  constructor() {
    this.clipper = new ClipperAdapter();
    this.cam = new CamCore(this.clipper);
  }

  generate(inputPaths, config) {
    const geometry = inputPaths.map(p => p instanceof Array ? p : p.points.map(pt => ({ X: Math.round(pt.x * this.clipper.mmToClipperScale), Y: Math.round(pt.y * this.clipper.mmToClipperScale) })));
    if (config.margin) {
      const margin = config.margin * this.clipper.mmToClipperScale;
      for (let i = 0; i < geometry.length; i++)
        geometry[i] = this.clipper.offset([geometry[i]], -margin)[0];
    }
    const lineDistance = (config.spacing || 0.2) * this.clipper.mmToClipperScale;
    const angle = config.angle || 0;
    const camPaths = this.cam.fillPath(geometry, lineDistance, angle);
    this.cam.reduceCamPaths(camPaths, (config.segmentLength || 0.1) * this.clipper.mmToClipperScale);
    return camPaths;
  }
}
