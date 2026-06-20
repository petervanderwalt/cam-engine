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
    const direction = config.direction || 'x';
    const count = direction === 'x'
      ? Math.ceil(bounds.height / stepover)
      : Math.ceil(bounds.width / stepover);
    for (let i = 0; i <= count; i++) {
      const points = [];
      if (direction === 'x') {
        const y = bounds.minY + i * stepover;
        for (let x = bounds.minX; x <= bounds.maxX; x += stepover) {
          const z = this.sampleMaxZ(triangles, x, y);
          if (z !== null) points.push({ x, y, z });
        }
      } else {
        const x = bounds.minX + i * stepover;
        for (let y = bounds.minY; y <= bounds.maxY; y += stepover) {
          const z = this.sampleMaxZ(triangles, x, y);
          if (z !== null) points.push({ x, y, z });
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
