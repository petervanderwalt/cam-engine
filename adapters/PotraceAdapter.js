import { Path } from '../types/Path.js';

export class PotraceAdapter {
  constructor() {
    this._potrace = null;
  }

  get potrace() {
    if (!this._potrace) {
      if (typeof Potrace !== 'undefined') {
        this._potrace = Potrace;
      } else {
        throw new Error('Potrace not loaded. Include potrace.js');
      }
    }
    return this._potrace;
  }

  trace(imageData, options = {}) {
    const {
      threshold = 128,
      turdSize = 2,
      alphaMax = 1,
      optCurve = true,
      optTolerance = 0.2
    } = options;
    const P = this.potrace;
    const bitmap = this._imageDataToBitmap(imageData, threshold);
    const tracer = new P();
    tracer.loadBitmap(bitmap);
    tracer.threshold(threshold);
    tracer.turdSize(turdSize);
    tracer.alphaMax(alphaMax);
    tracer.optCurve(optCurve);
    tracer.optTolerance(optTolerance);
    const paths = [];
    tracer.process(() => {
      const n = tracer.pathlist.length;
      for (let i = 0; i < n; i++) {
        const curve = tracer.pathlist[i];
        if (!curve || !curve.curve) continue;
        const pts = [];
        const segments = curve.curve.segments || [];
        for (const seg of segments) {
          if (seg.length === 2) {
            pts.push({ x: seg[0].x, y: seg[0].y, z: 0 });
          } else if (seg.length >= 3) {
            pts.push({ x: seg[0].x, y: seg[0].y, z: 0 });
            pts.push({ x: seg[1].x, y: seg[1].y, z: 0 });
            pts.push({ x: seg[2].x, y: seg[2].y, z: 0 });
          }
        }
        if (pts.length > 2) {
          const path = new Path(pts, true);
          paths.push(path);
        }
      }
    });
    return paths;
  }

  traceFromCanvas(canvas, options = {}) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return this.trace(imageData, options);
  }

  _imageDataToBitmap(imageData, threshold) {
    const w = imageData.width;
    const h = imageData.height;
    const bitmap = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = imageData.data[idx];
        const g = imageData.data[idx + 1];
        const b = imageData.data[idx + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        row.push(brightness < threshold ? 1 : 0);
      }
      bitmap.push(row);
    }
    return bitmap;
  }

  traceUrl(imageUrl, options = {}) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        try {
          const paths = this.traceFromCanvas(canvas, options);
          resolve(paths);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = imageUrl;
    });
  }
}
