import { Path } from '../types/Path.js';

export class BitmapAdapter {
  constructor() {
    this.canvas = null;
    this.ctx = null;
  }

  _ensureCanvas() {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }
    return this.ctx;
  }

  loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = src;
    });
  }

  imageDataFromImg(img) {
    const ctx = this._ensureCanvas();
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, img.width, img.height);
  }

  imageDataFromUrl(url) {
    return this.loadImage(url).then(img => this.imageDataFromImg(img));
  }

  getGrayscalePixels(imageData) {
    const w = imageData.width;
    const h = imageData.height;
    const pixels = [];
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = imageData.data[idx];
        const g = imageData.data[idx + 1];
        const b = imageData.data[idx + 2];
        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
        row.push(gray);
      }
      pixels.push(row);
    }
    return { pixels, width: w, height: h };
  }

  normalizeDepth(pixels, maxDepth) {
    const h = pixels.length;
    const w = pixels[0].length;
    const result = [];
    let min = 255, max = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = pixels[y][x];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    for (let y = 0; y < h; y++) {
      const row = [];
      for (let x = 0; x < w; x++) {
        const normalized = (pixels[y][x] - min) / (max - min || 1);
        row.push(normalized * maxDepth);
      }
      result.push(row);
    }
    return result;
  }

  resize(imageData, maxWidth, maxHeight) {
    const ctx = this._ensureCanvas();
    const scale = Math.min(maxWidth / imageData.width, maxHeight / imageData.height, 1);
    const nw = Math.round(imageData.width * scale);
    const nh = Math.round(imageData.height * scale);
    this.canvas.width = nw;
    this.canvas.height = nh;
    const tempCtx = document.createElement('canvas').getContext('2d');
    tempCtx.canvas.width = imageData.width;
    tempCtx.canvas.height = imageData.height;
    tempCtx.putImageData(imageData, 0, 0);
    ctx.drawImage(tempCtx.canvas, 0, 0, nw, nh);
    return ctx.getImageData(0, 0, nw, nh);
  }

  pixelsFromHeightArray(heightArray, width, height) {
    const imageData = this._ensureCanvas().createImageData(width, height);
    let min = Infinity, max = -Infinity;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = heightArray[y]?.[x] ?? 0;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    const range = max - min || 1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = heightArray[y]?.[x] ?? 0;
        const gray = Math.round(((v - min) / range) * 255);
        const idx = (y * width + x) * 4;
        imageData.data[idx] = gray;
        imageData.data[idx + 1] = gray;
        imageData.data[idx + 2] = gray;
        imageData.data[idx + 3] = 255;
      }
    }
    return imageData;
  }

  rasterToPaths(imageData, options = {}) {
    const {
      scanAngle = 0,
      scanSpacing = 1,
      dpi = 254
    } = options;
    const mmPerPixel = 25.4 / dpi;
    const w = imageData.width;
    const h = imageData.height;
    const paths = [];
    const angleRad = scanAngle * Math.PI / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const spacing = Math.max(1, scanSpacing / mmPerPixel);
    const lines = Math.ceil(angleRad === 0 ? h / spacing :
      (Math.abs(w * sinA) + Math.abs(h * cosA)) / spacing);
    for (let i = 0; i < lines; i++) {
      const offset = i * spacing;
      const pts = [];
      let collecting = false;
      let startX = 0, startY = 0;
      if (Math.abs(angleRad) < 0.001 || Math.abs(angleRad - Math.PI) < 0.001) {
        const y = offset;
        if (y >= h) break;
        for (let x = 0; x < w; x++) {
          const idx = (y * w + x) * 4;
          const gray = imageData.data[idx];
          if (gray < 128 && !collecting) {
            collecting = true;
            startX = x;
            startY = y;
          } else if (gray >= 128 && collecting) {
            pts.push({ x: ((startX + x) / 2) * mmPerPixel, y: y * mmPerPixel, z: 0 });
            collecting = false;
          }
        }
        if (collecting) {
          pts.push({ x: ((startX + w) / 2) * mmPerPixel, y: y * mmPerPixel, z: 0 });
        }
      } else {
        for (let t = -w; t < w + h; t++) {
          const px = t * cosA;
          const py = offset + t * sinA;
          const ix = Math.round(px);
          const iy = Math.round(py);
          if (ix < 0 || ix >= w || iy < 0 || iy >= h) {
            if (collecting) {
              pts.push({ x: (startX + ix) / 2 * mmPerPixel, y: (startY + iy) / 2 * mmPerPixel, z: 0 });
              collecting = false;
            }
            continue;
          }
          const idx = (iy * w + ix) * 4;
          const gray = imageData.data[idx];
          if (gray < 128 && !collecting) {
            collecting = true;
            startX = ix;
            startY = iy;
          } else if (gray >= 128 && collecting) {
            pts.push({ x: (startX + ix) / 2 * mmPerPixel, y: (startY + iy) / 2 * mmPerPixel, z: 0 });
            collecting = false;
          }
        }
      }
      if (pts.length > 0) {
        const path = new Path(pts, false);
        paths.push(path);
      }
    }
    return paths;
  }
}
