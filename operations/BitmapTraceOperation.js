import { Toolpath } from '../types/Toolpath.js';
import { PotraceAdapter } from '../adapters/PotraceAdapter.js';

export class BitmapTraceOperation {
  constructor() {
    this.potrace = new PotraceAdapter();
  }

  generate(imageData, config) {
    const tp = new Toolpath('bitmapTrace', config);
    const paths = this.potrace.trace(imageData, {
      threshold: config.threshold || 128,
      turdSize: config.turdSize || 2,
      alphaMax: config.alphaMax || 1,
      optCurve: config.optCurve !== false
    });
    for (const path of paths) {
      path.points.forEach(pt => pt.z = 0);
      tp.addPath(path, 0);
    }
    tp.metadata.inputType = 'bitmap';
    tp.metadata.traced = true;
    tp.computeBounds();
    return tp;
  }

  generateFromCanvas(canvas, config) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return this.generate(imageData, config);
  }

  async generateFromUrl(url, config) {
    const imageData = await this.potrace.traceUrl(url, config);
    return this.generate(imageData, config);
  }
}
