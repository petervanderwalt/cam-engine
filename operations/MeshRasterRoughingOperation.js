import { MeshToolpathCore } from '../core/MeshToolpathCore.js';
import { Path } from '../types/Path.js';

export class MeshRasterRoughingOperation {
  constructor() {
    this.core = new MeshToolpathCore();
  }

  generate(mesh, config = {}) {
    const toolpath = this.core.createToolpath('mesh-raster-roughing', config);
    const triangles = this.core.getTriangles(mesh);
    const bounds = this.core.getBounds(triangles);
    if (!bounds) return toolpath;
    const stepdown = Math.abs(config.stepdown || 1) || 1;
    const stepover = config.stepover || 1;
    const toolRadius = (config.toolDiameter || 3.175) * 0.5;
    const angle = (config.angle || 0) * Math.PI / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    let level = 0;
    for (let z = bounds.maxZ - stepdown; z >= bounds.minZ - 1e-9; z -= stepdown) {
      let clipperPaths = this.core.loopsToClipper(this.core.linkSegmentsToLoops(this.core.sliceTrianglesAtZ(triangles, z)));
      if (!clipperPaths.length) continue;
      clipperPaths = this.core.clipper.offset(this.core.clipper.clean(this.core.clipper.simplify(clipperPaths)), -toolRadius * this.core.scale);
      if (!clipperPaths.length) continue;
      const cb = this.core.clipper.clipperBounds(clipperPaths);
      const cx = (cb.minX + cb.maxX) / 2;
      const cy = (cb.minY + cb.maxY) / 2;
      const radius = Math.hypot(cb.maxX - cb.minX, cb.maxY - cb.minY) / 2 + stepover * this.core.scale;
      for (let offset = -radius; offset <= radius; offset += stepover * this.core.scale) {
        const current = [];
        for (let d = -radius; d <= radius; d += this.core.scale * 0.5) {
          const point = {
            X: Math.round(cx + offset * cosA - d * sinA),
            Y: Math.round(cy + offset * sinA + d * cosA)
          };
          if (this.isInsideAny(point, clipperPaths)) {
            current.push(point);
            continue;
          }
          if (current.length > 1) {
            toolpath.addPath(new Path(current.map(sample => ({
              x: sample.X / this.core.scale,
              y: sample.Y / this.core.scale,
              z
            })), false), level);
          }
          current.length = 0;
        }
        if (current.length > 1) {
          toolpath.addPath(new Path(current.map(sample => ({
            x: sample.X / this.core.scale,
            y: sample.Y / this.core.scale,
            z
          })), false), level);
        }
      }
      level += 1;
    }
    toolpath.metadata.inputType = 'mesh';
    toolpath.computeBounds();
    return toolpath;
  }

  isInsideAny(point, clipperPaths) {
    return clipperPaths.some(path => this.core.clipper.pointInPolygon(point, path) !== 0);
  }
}
