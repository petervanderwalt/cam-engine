import { MeshToolpathCore } from '../core/MeshToolpathCore.js';

export class MeshWaterlineRoughingOperation {
  constructor() {
    this.core = new MeshToolpathCore();
  }

  generate(mesh, config = {}) {
    const toolpath = this.core.createToolpath('mesh-waterline-roughing', config);
    const triangles = this.core.getTriangles(mesh);
    const bounds = this.core.getBounds(triangles);
    if (!bounds) return toolpath;
    const stepdown = Math.abs(config.stepdown || 1) || 1;
    const stepover = config.stepover || 1;
    const toolRadius = (config.toolDiameter || 3.175) * 0.5 + (config.stockToLeave || 0);
    let level = 0;
    for (let z = bounds.maxZ - stepdown; z >= bounds.minZ - 1e-9; z -= stepdown) {
      const loops = this.core.linkSegmentsToLoops(this.core.sliceTrianglesAtZ(triangles, z));
      if (!loops.length) continue;
      let current = this.core.clipper.clean(this.core.clipper.simplify(this.core.loopsToClipper(loops)));
      current = this.core.clipper.offset(current, -toolRadius * this.core.scale);
      while (current.length) {
        for (const path of this.core.clipperToPaths(current, z, true)) toolpath.addPath(path, level);
        current = this.core.clipper.offset(current, -stepover * this.core.scale);
      }
      level += 1;
    }
    toolpath.metadata.inputType = 'mesh';
    toolpath.computeBounds();
    return toolpath;
  }
}
