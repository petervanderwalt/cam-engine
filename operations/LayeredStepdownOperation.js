import { Toolpath } from '../types/Toolpath.js';
import { Path } from '../types/Path.js';
import { VectorOperation } from './VectorOperation.js';
import { PocketOperation } from './PocketOperation.js';

export class LayeredStepdownOperation {
  constructor() {
    this.vectorOperation = new VectorOperation();
    this.pocketOperation = new PocketOperation();
  }

  generate(inputPaths, config = {}, openPaths = []) {
    const mode = config.mode || 'outside';
    const roughingConfig = { ...config };
    if (Number.isFinite(config.finishPassDepth) && config.finishPassDepth > 0) {
      roughingConfig.zEnd = Math.max(config.zEnd, config.zEnd + config.finishPassDepth);
    }
    let camPaths;
    if (mode === 'pocket') {
      camPaths = this.pocketOperation.generate(inputPaths, roughingConfig);
    } else if (mode === 'inside') {
      camPaths = this.vectorOperation.generate(inputPaths, { ...roughingConfig, mode: 'inside' }, openPaths);
    } else if (mode === 'cut') {
      camPaths = this.vectorOperation.generate(inputPaths, { ...roughingConfig, mode: 'cut' }, openPaths);
    } else {
      camPaths = this.vectorOperation.generate(inputPaths, { ...roughingConfig, mode: 'outside' }, openPaths);
    }

    const zStart = Number.isFinite(config.zStart) ? config.zStart : 0;
    const zEnd = Number.isFinite(config.zEnd) ? config.zEnd : -3;
    const passDepth = Math.abs(config.passDepth || 0.5) || 0.5;
    const toolpath = new Toolpath('layered-stepdown', { ...config, mode });
    const levels = [];
    let currentZ = zStart;
    let level = 0;
    const roughingEnd = Number.isFinite(roughingConfig.zEnd) ? roughingConfig.zEnd : zEnd;

    while (currentZ > roughingEnd) {
      currentZ = Math.max(currentZ - passDepth, roughingEnd);
      levels.push(currentZ);
      for (const camPath of camPaths) {
        const points = camPath.path.map(point => ({
          x: point.X / this.vectorOperation.clipper.mmToClipperScale,
          y: point.Y / this.vectorOperation.clipper.mmToClipperScale,
          z: currentZ
        }));
        toolpath.addPath(new Path(points, !!camPath.safeToClose), level);
      }
      level += 1;
    }

    const finalPassCount = 1 + Math.max(0, Math.trunc(config.springPasses || 0));
    if (zEnd < roughingEnd || !levels.length) {
      for (let i = 0; i < finalPassCount; i++) {
        levels.push(zEnd);
        for (const camPath of camPaths) {
          const points = camPath.path.map(point => ({
            x: point.X / this.vectorOperation.clipper.mmToClipperScale,
            y: point.Y / this.vectorOperation.clipper.mmToClipperScale,
            z: zEnd
          }));
          toolpath.addPath(new Path(points, !!camPath.safeToClose), level);
        }
        level += 1;
      }
    } else if (config.springPasses) {
      for (let i = 0; i < Math.trunc(config.springPasses); i++) {
        levels.push(zEnd);
        for (const camPath of camPaths) {
          const points = camPath.path.map(point => ({
            x: point.X / this.vectorOperation.clipper.mmToClipperScale,
            y: point.Y / this.vectorOperation.clipper.mmToClipperScale,
            z: zEnd
          }));
          toolpath.addPath(new Path(points, !!camPath.safeToClose), level);
        }
        level += 1;
      }
    }

    toolpath.metadata.levels = levels;
    toolpath.metadata.inputType = 'vector';
    if (Array.isArray(config.tabs) && config.tabs.length) {
      const tabHeight = Number.isFinite(config.tabHeight) ? config.tabHeight : 1;
      toolpath.applyTabs(config.tabs, {
        tabWidth: config.tabWidth,
        tabHeight,
        targetZ: Number.isFinite(config.tabZ) ? config.tabZ : Math.min(zStart, zEnd + tabHeight),
        tolerance: Number.isFinite(config.tabTolerance) ? config.tabTolerance : undefined
      });
    }
    toolpath.computeBounds();
    return toolpath;
  }
}
