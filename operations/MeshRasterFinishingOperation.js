import { MeshToolpathCore } from '../core/MeshToolpathCore.js';
import { Path } from '../types/Path.js';

export class MeshRasterFinishingOperation {
  constructor() {
    this.core = new MeshToolpathCore();
  }

  generate(mesh, config = {}) {
    const toolpath = this.core.createToolpath('mesh-raster-finishing', config);
    const triangles = this.core.getTriangles(mesh);
    const bounds = this.core.getBounds(triangles);
    if (!bounds) return toolpath;
    const stepover = config.stepover || 1;
    const toolRadius = (config.toolDiameter || 3.175) * 0.5;
    const stockToLeave = config.stockToLeave || 0;
    const effectiveRadius = toolRadius + stockToLeave;
    const direction = config.direction || 'x';
    const count = direction === 'x'
      ? Math.ceil(bounds.height / stepover)
      : Math.ceil(bounds.width / stepover);

    for (let i = 0; i <= count; i++) {
      const points = [];
      if (direction === 'x') {
        const y = bounds.minY + i * stepover;
        for (let x = bounds.minX; x <= bounds.maxX; x += stepover) {
          const zTip = this.sampleBallnoseOffset(triangles, x, y, effectiveRadius, stepover);
          if (zTip !== null) points.push({ x, y, z: zTip });
        }
      } else {
        const x = bounds.minX + i * stepover;
        for (let y = bounds.minY; y <= bounds.maxY; y += stepover) {
          const zTip = this.sampleBallnoseOffset(triangles, x, y, effectiveRadius, stepover);
          if (zTip !== null) points.push({ x, y, z: zTip });
        }
      }
      if (points.length > 1) {
        if (i % 2 === 1) points.reverse();
        toolpath.addPath(new Path(points, false), 0);
      }
    }
    toolpath.metadata.inputType = 'mesh';
    toolpath.computeBounds();
    return toolpath;
  }

  sampleBallnoseOffset(triangles, cx, cy, radius, step) {
    const probeStep = Math.min(step * 0.5, radius * 0.25, 0.5);
    const rCells = Math.ceil(radius / probeStep);
    let minTip = null;
    for (let dy = -rCells; dy <= rCells; dy++) {
      for (let dx = -rCells; dx <= rCells; dx++) {
        const px = cx + dx * probeStep;
        const py = cy + dy * probeStep;
        const d2 = dx * dx + dy * dy;
        if (d2 * probeStep * probeStep > radius * radius + 1e-9) continue;
        const meshZ = this.sampleMaxZ(triangles, px, py);
        if (meshZ === null) continue;
        const d = Math.hypot(dx * probeStep, dy * probeStep);
        const neededZ = meshZ - radius + Math.sqrt(Math.max(0, radius * radius - d * d));
        if (minTip === null || neededZ < minTip) minTip = neededZ;
      }
    }
    return minTip;
  }

  sampleMaxZ(triangles, x, y) {
    let best = null;
    for (const tri of triangles) {
      const z = this.rayTriangleZ(x, y, tri[0], tri[1], tri[2]);
      if (z !== null && (best === null || z > best)) best = z;
    }
    return best;
  }

  rayTriangleZ(px, py, a, b, c) {
    const e1x = b.x - a.x;
    const e1y = b.y - a.y;
    const e2x = c.x - a.x;
    const e2y = c.y - a.y;
    const denom = e1x * e2y - e2x * e1y;
    if (Math.abs(denom) < 1e-9) return null;
    const sx = px - a.x;
    const sy = py - a.y;
    const beta = (sx * e2y - sy * e2x) / denom;
    const gamma = (sy * e1x - sx * e1y) / denom;
    if (beta < -1e-9 || gamma < -1e-9 || beta + gamma > 1 + 1e-9) return null;
    return (1 - beta - gamma) * a.z + beta * b.z + gamma * c.z;
  }
}
