import { CamCore } from '../core/CamCore.js';
import { ClipperAdapter } from '../adapters/ClipperAdapter.js';

export class VectorOperation {
  constructor() {
    this.clipper = new ClipperAdapter();
    this.cam = new CamCore(this.clipper);
  }

  generate(inputPaths, config, openPaths = []) {
    const geometry = inputPaths.map(p => p instanceof Array ? p : p.points.map(pt => ({ X: Math.round(pt.x * this.clipper.mmToClipperScale), Y: Math.round(pt.y * this.clipper.mmToClipperScale) })));
    const openGeometry = openPaths.map(p => p instanceof Array ? p : p.points.map(pt => ({ X: Math.round(pt.x * this.clipper.mmToClipperScale), Y: Math.round(pt.y * this.clipper.mmToClipperScale) })));
    const climb = config.climb || false;
    let camPaths;
    if (config.mode === 'cut') {
      camPaths = this.cam.cut(geometry, openGeometry, config.direction === 'Climb');
    } else if (config.mode === 'inside') {
      if (config.margin) {
        const margin = config.margin * this.clipper.mmToClipperScale;
        for (let i = 0; i < geometry.length; i++)
          geometry[i] = this.clipper.offset([geometry[i]], -margin)[0];
      }
      camPaths = this.cam.insideOutside(geometry, (config.toolDiameter || 3.175) * this.clipper.mmToClipperScale,
        true, (config.cutWidth || config.toolDiameter) * this.clipper.mmToClipperScale,
        config.stepOver || 40, config.direction === 'Climb', false);
    } else if (config.mode === 'outside') {
      if (config.margin) {
        const margin = config.margin * this.clipper.mmToClipperScale;
        for (let i = 0; i < geometry.length; i++)
          geometry[i] = this.clipper.offset([geometry[i]], margin)[0];
      }
      camPaths = this.cam.insideOutside(geometry, (config.toolDiameter || 3.175) * this.clipper.mmToClipperScale,
        false, (config.cutWidth || config.toolDiameter) * this.clipper.mmToClipperScale,
        config.stepOver || 40, config.direction === 'Climb', false);
    } else {
      camPaths = this.cam.cut(geometry, openGeometry, false);
    }
    this.cam.reduceCamPaths(camPaths, (config.segmentLength || 0.1) * this.clipper.mmToClipperScale);
    return camPaths;
  }
}
