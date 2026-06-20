import { Toolpath } from '../types/Toolpath.js';
import { Path } from '../types/Path.js';
import { ClipperAdapter } from '../adapters/ClipperAdapter.js';

export class TextureOperation {
  constructor() {
    this.clipper = new ClipperAdapter();
  }

  generate(inputPaths, config) {
    const pattern = config.pattern || 'linear';
    const spacing = config.spacing || 1;
    const amplitude = config.amplitude || 0.3;
    const angle = (config.angle || 0) * Math.PI / 180;
    const unioned = inputPaths.length > 1 ? this.clipper.union(inputPaths) : inputPaths;
    const bounds = this._getBounds(unioned);
    if (!bounds) return new Toolpath('texture', config);
    switch (pattern) {
      case 'crosshatch': return this._crosshatch(unioned, bounds, spacing, amplitude);
      case 'peck': return this._peck(unioned, bounds, spacing, amplitude);
      case 'diamond': return this._diamond(unioned, bounds, spacing, amplitude);
      case 'ripple': return this._ripple(unioned, bounds, spacing, amplitude);
      case 'radial': return this._radial(unioned, bounds, spacing, amplitude);
      case 'stipple': return this._stipple(unioned, bounds, spacing, amplitude);
      default: return this._linear(unioned, bounds, spacing, amplitude, angle);
    }
  }

  _linear(paths, bounds, spacing, amplitude, angle) {
    const tp = new Toolpath('texture', { pattern: 'linear' });
    const lines = this._scanLines(bounds, spacing, angle);
    for (const line of lines) {
      const segments = this.clipper.intersection([line], paths);
      for (const seg of segments) {
        for (const pt of seg.points) pt.z = -amplitude;
        if (seg.points.length > 1) tp.addPath(seg, 0);
      }
    }
    tp.computeBounds();
    return tp;
  }

  _crosshatch(paths, bounds, spacing, amplitude) {
    const tp = new Toolpath('texture', { pattern: 'crosshatch' });
    for (let a = 0; a < 2; a++) {
      const angle = a * Math.PI / 2;
      const lines = this._scanLines(bounds, spacing, angle);
      for (const line of lines) {
        const segments = this.clipper.intersection([line], paths);
        for (const seg of segments) {
          for (const pt of seg.points) pt.z = -amplitude;
          if (seg.points.length > 1) tp.addPath(seg, a);
        }
      }
    }
    tp.computeBounds();
    return tp;
  }

  _peck(paths, bounds, spacing, amplitude) {
    const tp = new Toolpath('texture', { pattern: 'peck' });
    const cx = bounds.minX + bounds.width / 2;
    const cy = bounds.minY + bounds.height / 2;
    for (let x = bounds.minX; x <= bounds.maxX; x += spacing) {
      for (let y = bounds.minY; y <= bounds.maxY; y += spacing) {
        const pt = { x, y, z: -amplitude };
        const ptPath = new Path([pt, { x, y, z: 0 }], false);
        const test = new Path([{ x, y, z: 0 }], true);
        const clipped = this.clipper.intersection([test], paths);
        if (clipped.length > 0) {
          tp.addPath(ptPath, 0);
        }
      }
    }
    tp.computeBounds();
    return tp;
  }

  _diamond(paths, bounds, spacing, amplitude) {
    const tp = new Toolpath('texture', { pattern: 'diamond' });
    const cx = bounds.minX + bounds.width / 2;
    const cy = bounds.minY + bounds.height / 2;
    const halfSp = spacing / 2;
    for (let x = bounds.minX - spacing; x <= bounds.maxX + spacing; x += spacing) {
      for (let y = bounds.minY - spacing; y <= bounds.maxY + spacing; y += spacing) {
        const pts = [
          { x, y: y + halfSp, z: 0 },
          { x: x + halfSp, y, z: -amplitude },
          { x, y: y - halfSp, z: 0 },
          { x: x - halfSp, y, z: -amplitude },
          { x, y: y + halfSp, z: 0 }
        ];
        const diamond = new Path(pts, true);
        const clipped = this.clipper.intersection([diamond], paths);
        for (const seg of clipped) {
          if (seg.points.length > 2) tp.addPath(seg, 0);
        }
      }
    }
    tp.computeBounds();
    return tp;
  }

  _ripple(paths, bounds, spacing, amplitude) {
    const tp = new Toolpath('texture', { pattern: 'ripple' });
    const angle = 0;
    const lines = this._scanLines(bounds, spacing, angle);
    for (const line of lines) {
      const segments = this.clipper.intersection([line], paths);
      for (const seg of segments) {
        for (const pt of seg.points) {
          pt.z = -amplitude * Math.sin(pt.x * 0.5) * Math.cos(pt.y * 0.5);
        }
        if (seg.points.length > 1) tp.addPath(seg, 0);
      }
    }
    tp.computeBounds();
    return tp;
  }

  _radial(paths, bounds, spacing, amplitude) {
    const tp = new Toolpath('texture', { pattern: 'radial' });
    const cx = bounds.minX + bounds.width / 2;
    const cy = bounds.minY + bounds.height / 2;
    const maxR = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height) / 2;
    const nRings = Math.ceil(maxR / spacing);
    for (let r = 1; r <= nRings; r++) {
      const radius = r * spacing;
      const pts = [];
      const nPts = Math.max(8, Math.round(radius * Math.PI * 2 / spacing));
      for (let i = 0; i <= nPts; i++) {
        const a = (i / nPts) * Math.PI * 2;
        const x = cx + radius * Math.cos(a);
        const y = cy + radius * Math.sin(a);
        pts.push({ x, y, z: -amplitude * Math.sin(radius * 0.5) });
      }
      const ring = new Path(pts, true);
      const clipped = this.clipper.intersection([ring], paths);
      for (const seg of clipped) {
        if (seg.points.length > 2) tp.addPath(seg, r);
      }
    }
    tp.computeBounds();
    return tp;
  }

  _stipple(paths, bounds, spacing, amplitude) {
    const tp = new Toolpath('texture', { pattern: 'stipple' });
    for (let x = bounds.minX; x <= bounds.maxX; x += spacing) {
      for (let y = bounds.minY; y <= bounds.maxY; y += spacing) {
        const jitter = spacing * 0.3;
        const jx = x + (Math.random() - 0.5) * jitter;
        const jy = y + (Math.random() - 0.5) * jitter;
        const pt = { x: jx, y: jy, z: -amplitude * (0.5 + Math.random() * 0.5) };
        const ptPath = new Path([pt, { x: jx, y: jy, z: 0 }], false);
        const test = new Path([{ x: jx, y: jy, z: 0 }], true);
        const clipped = this.clipper.intersection([test], paths);
        if (clipped.length > 0) {
          tp.addPath(ptPath, 0);
        }
      }
    }
    tp.computeBounds();
    return tp;
  }

  _scanLines(bounds, spacing, angle) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const cx = bounds.minX + bounds.width / 2;
    const cy = bounds.minY + bounds.height / 2;
    const diag = Math.sqrt(bounds.width * bounds.width + bounds.height * bounds.height);
    const lines = [];
    const nLines = Math.ceil(diag / spacing);
    for (let i = 0; i <= nLines; i++) {
      const t = -diag / 2 + i * spacing;
      const pts = [];
      for (let d = -diag / 2; d <= diag / 2; d += 0.2) {
        pts.push({ x: cx + t * cosA - d * sinA, y: cy + t * sinA + d * cosA });
      }
      lines.push(new Path(pts, false));
    }
    return lines;
  }

  _getBounds(paths) {
    let b = null;
    for (const p of paths) {
      const pb = p.bounds;
      if (!pb) continue;
      if (!b) b = { ...pb };
      else {
        if (pb.minX < b.minX) b.minX = pb.minX;
        if (pb.minY < b.minY) b.minY = pb.minY;
        if (pb.maxX > b.maxX) b.maxX = pb.maxX;
        if (pb.maxY > b.maxY) b.maxY = pb.maxY;
      }
    }
    if (b) { b.width = b.maxX - b.minX; b.height = b.maxY - b.minY; }
    return b;
  }
}
