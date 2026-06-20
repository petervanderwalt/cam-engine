export class Path {
  constructor(points = [], closed = false) {
    this.points = points;
    this.closed = closed;
    this.z = 0;
  }

  addPoint(x, y, z = 0) {
    this.points.push({ x, y, z });
  }

  get length() {
    return this.points.length;
  }

  get bounds() {
    if (!this.points.length) return null;
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const p of this.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  reverse() {
    this.points.reverse();
  }

  translate(dx, dy) {
    for (const p of this.points) {
      p.x += dx;
      p.y += dy;
    }
  }

  scale(sx, sy = sx) {
    for (const p of this.points) {
      p.x *= sx;
      p.y *= sy;
    }
  }

  rotate(angle, cx = 0, cy = 0) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (const p of this.points) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      p.x = cx + dx * cos - dy * sin;
      p.y = cy + dx * sin + dy * cos;
    }
  }

  toClipperPath(scale = 10000) {
    return this.points.map(p => ({
      X: Math.round(p.x * scale),
      Y: Math.round(p.y * scale)
    }));
  }

  static fromClipperPath(clipperPath, scale = 10000, z = 0) {
    const pts = clipperPath.map(p => ({
      x: p.X / scale,
      y: p.Y / scale,
      z
    }));
    return new Path(pts, true);
  }

  static fromArray(arr) {
    return new Path(arr.map(p =>
      typeof p.x === 'number' ? { x: p.x, y: p.y, z: p.z || 0 } : { x: p[0], y: p[1], z: p[2] || 0 }
    ));
  }

  clone() {
    return new Path(
      this.points.map(p => ({ ...p })),
      this.closed
    );
  }
}
