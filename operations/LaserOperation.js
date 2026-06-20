import { CamCore } from '../core/CamCore.js';
import { ClipperAdapter } from '../adapters/ClipperAdapter.js';
import { WASMAdapter } from '../adapters/WASMAdapter.js';

export class LaserOperation {
  constructor() {
    this.clipper = new ClipperAdapter();
    this.cam = new CamCore(this.clipper);
    this.wasm = new WASMAdapter();
    this.wasm.setClipper(this.clipper);
  }

  generateVector(inputPaths, openPaths, config) {
    const geometry = inputPaths.map(p => p instanceof Array ? p : p.points.map(pt => ({ X: Math.round(pt.x * this.clipper.mmToClipperScale), Y: Math.round(pt.y * this.clipper.mmToClipperScale) })));
    const openGeometry = openPaths.map(p => p instanceof Array ? p : p.points.map(pt => ({ X: Math.round(pt.x * this.clipper.mmToClipperScale), Y: Math.round(pt.y * this.clipper.mmToClipperScale) })));
    let camPaths;
    if (config.mode === 'cut') {
      camPaths = this.cam.cut(geometry, openGeometry, false);
    } else if (config.mode === 'inside') {
      if (config.margin) {
        const margin = config.margin * this.clipper.mmToClipperScale;
        for (let i = 0; i < geometry.length; i++)
          geometry[i] = this.clipper.offset([geometry[i]], -margin)[0];
      }
      camPaths = this.cam.insideOutside(geometry, (config.laserDiameter || 0.1) * this.clipper.mmToClipperScale,
        true, (config.cutWidth || 0.1) * this.clipper.mmToClipperScale,
        config.stepOver || 40, config.direction === 'Climb', false);
    } else if (config.mode === 'outside') {
      if (config.margin) {
        const margin = config.margin * this.clipper.mmToClipperScale;
        for (let i = 0; i < geometry.length; i++)
          geometry[i] = this.clipper.offset([geometry[i]], margin)[0];
      }
      camPaths = this.cam.insideOutside(geometry, (config.laserDiameter || 0.1) * this.clipper.mmToClipperScale,
        false, (config.cutWidth || 0.1) * this.clipper.mmToClipperScale,
        config.stepOver || 40, config.direction === 'Climb', false);
    } else if (config.mode === 'fill') {
      if (config.margin) {
        const margin = config.margin * this.clipper.mmToClipperScale;
        for (let i = 0; i < geometry.length; i++)
          geometry[i] = this.clipper.offset([geometry[i]], -margin)[0];
      }
      camPaths = this.cam.fillPath(geometry, (config.lineDistance || 0.2) * this.clipper.mmToClipperScale, config.lineAngle || 0);
    } else {
      camPaths = this.cam.cut(geometry, openGeometry, false);
    }
    this.cam.reduceCamPaths(camPaths, (config.segmentLength || 0.1) * this.clipper.mmToClipperScale);
    return camPaths;
  }

  separateTabsOnPath(cutterPath, tabGeometry) {
    return this.wasm.separateTabs(cutterPath, tabGeometry);
  }
}
