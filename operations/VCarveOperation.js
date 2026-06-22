import { CamCore } from '../core/CamCore.js';
import { ClipperAdapter } from '../adapters/ClipperAdapter.js';
import { WASMAdapter } from '../adapters/WASMAdapter.js';

export class VCarveOperation {
  constructor() {
    this.clipper = new ClipperAdapter();
    this.cam = new CamCore(this.clipper);
    this.wasm = new WASMAdapter();
    this.wasm.setClipper(this.clipper);
  }

  generate(inputPaths, config) {
    const geometry = inputPaths.map(p => p instanceof Array ? p : p.points.map(pt => ({ X: Math.round(pt.x * this.clipper.mmToClipperScale), Y: Math.round(pt.y * this.clipper.mmToClipperScale) })));
    const cutterAngle = config.cutterAngle || 90;
    const rawPassDepth = Math.abs(config.passDepth ?? config.zStep ?? 0) || 0;
    const passDepth = rawPassDepth > 0 ? rawPassDepth : (Math.abs(config.maxDepth || 3) * 2);
    const camPaths = this.wasm.vCarve(geometry, cutterAngle, passDepth,
      msg => { if (config.onError) config.onError(msg); });
    return camPaths;
  }
}
