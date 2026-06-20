import { Path } from './Path.js';

export class Toolpath {
  constructor(operationType = '', config = {}) {
    this.operationType = operationType;
    this.config = config;
    this.paths = [];
    this.rapidMoves = [];
    this.zLevels = [];
    this.bounds = null;
    this.estimatedTime = 0;
    this.metadata = {};
  }

  addPath(path, level = 0) {
    this.paths.push(path);
    if (!this.zLevels.includes(level)) {
      this.zLevels.push(level);
    }
  }

  addRapidMove(from, to) {
    this.rapidMoves.push({ from, to });
  }

  applyTabs(tabs = [], options = {}) {
    const defaults = {
      tabWidth: 5,
      tabHeight: 1,
      targetZ: null,
      tolerance: 0.75
    };
    const cfg = { ...defaults, ...options };
    if (!tabs.length) return this;
    for (const path of this.paths) {
      if (!path.points || path.points.length < 2) continue;
      const rewritten = [path.points[0]];
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1];
        const b = path.points[i];
        let inserted = false;
        for (const tab of tabs) {
          const tx = tab.x ?? tab.X;
          const ty = tab.y ?? tab.Y;
          const width = tab.width ?? cfg.tabWidth;
          const height = tab.height ?? cfg.tabHeight;
          const hit = segmentNearPoint(a, b, tx, ty, cfg.tolerance);
          if (!hit || hit.distance > width * 0.5) continue;
          const segmentLength = Math.hypot(b.x - a.x, b.y - a.y);
          if (segmentLength <= 1e-9) continue;
          const along = Math.max(0, Math.min(segmentLength, hit.t * segmentLength));
          const startAt = Math.max(0, along - width * 0.5);
          const endAt = Math.min(segmentLength, along + width * 0.5);
          const start = pointAlongSegment(a, b, startAt / segmentLength);
          const end = pointAlongSegment(a, b, endAt / segmentLength);
          const tabZ = Math.max(a.z ?? 0, b.z ?? 0, cfg.targetZ ?? ((a.z ?? 0) + height));
          if (!samePoint(rewritten[rewritten.length - 1], start)) rewritten.push(start);
          rewritten.push({ x: start.x, y: start.y, z: tabZ });
          rewritten.push({ x: end.x, y: end.y, z: tabZ });
          if (!samePoint(end, b)) rewritten.push(end);
          inserted = true;
          break;
        }
        rewritten.push(inserted ? b : b);
      }
      path.points = dedupeSequentialPoints(rewritten);
    }
    this.metadata.tabs = tabs.map(tab => ({ ...tab }));
    this.computeBounds();
    return this;
  }

  computeBounds() {
    if (!this.paths.length) return null;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const path of this.paths) {
      const b = path.bounds;
      if (!b) continue;
      if (b.minX < minX) minX = b.minX;
      if (b.minY < minY) minY = b.minY;
      if (b.maxX > maxX) maxX = b.maxX;
      if (b.maxY > maxY) maxY = b.maxY;
      for (const p of path.points) {
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
    }
    this.bounds = { minX, minY, minZ, maxX, maxY, maxZ };
    return this.bounds;
  }

  get totalCutDistance() {
    let dist = 0;
    for (const path of this.paths) {
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1];
        const b = path.points[i];
        dist += Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
      }
    }
    return dist;
  }

  toJSON() {
    return {
      operationType: this.operationType,
      config: this.config,
      paths: this.paths.map(p => ({
        closed: p.closed,
        points: p.points
      })),
      rapidMoves: this.rapidMoves,
      bounds: this.bounds,
      metadata: this.metadata
    };
  }

  static fromJSON(data) {
    const tp = new Toolpath(data.operationType, data.config);
    for (const pdata of data.paths) {
      const path = new Path();
      path.closed = pdata.closed;
      path.points = pdata.points.map(p => ({ ...p }));
      tp.paths.push(path);
    }
    tp.rapidMoves = data.rapidMoves || [];
    tp.bounds = data.bounds || null;
    tp.metadata = data.metadata || {};
    return tp;
  }

  static merge(toolpaths) {
    const merged = new Toolpath('merged', {});
    for (const tp of toolpaths) {
      for (const path of tp.paths) {
        merged.addPath(path);
      }
      merged.rapidMoves.push(...tp.rapidMoves);
    }
    merged.computeBounds();
    return merged;
  }
}

function samePoint(a, b) {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs((a.z ?? 0) - (b.z ?? 0)) < 1e-9;
}

function dedupeSequentialPoints(points) {
  const result = [];
  for (const point of points) {
    if (!result.length || !samePoint(result[result.length - 1], point)) result.push(point);
  }
  return result;
}

function pointAlongSegment(a, b, t) {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: (a.z ?? 0) + ((b.z ?? 0) - (a.z ?? 0)) * t
  };
}

function segmentNearPoint(a, b, px, py, tolerance) {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len2 = vx * vx + vy * vy;
  if (len2 <= 1e-12) return null;
  const t = Math.max(0, Math.min(1, ((px - a.x) * vx + (py - a.y) * vy) / len2));
  const qx = a.x + vx * t;
  const qy = a.y + vy * t;
  const distance = Math.hypot(px - qx, py - qy);
  if (distance > tolerance) return null;
  return { t, distance };
}
