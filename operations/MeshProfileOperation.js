import { MeshToolpathCore } from '../core/MeshToolpathCore.js';
import { LayeredStepdownOperation } from './LayeredStepdownOperation.js';

export class MeshProfileOperation {
  constructor() {
    this.core = new MeshToolpathCore();
    this.stepdownOperation = new LayeredStepdownOperation();
  }

  generate(mesh, config = {}) {
    const triangles = this.core.getTriangles(mesh);
    const bounds = this.core.getBounds(triangles);
    const projected = this.core.unionProjectedTriangles(triangles);
    const toolpath = this.core.createToolpath('mesh-profile', config);
    if (!bounds || !projected.length) return toolpath;
    const effectiveConfig = {
      ...config,
      mode: config.mode || 'outside',
      zStart: Number.isFinite(config.zStart) ? config.zStart : bounds.maxZ,
      zEnd: Number.isFinite(config.zEnd) ? config.zEnd : bounds.minZ
    };
    const profile = this.stepdownOperation.generate(projected, effectiveConfig, []);
    profile.operationType = 'mesh-profile';
    profile.metadata.inputType = 'mesh';
    profile.metadata.projected = true;
    profile.metadata.projectedPathCount = projected.length;
    profile.metadata.sourceBounds = bounds;
    return profile;
  }
}
