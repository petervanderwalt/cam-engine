import { Toolpath } from '../types/Toolpath.js';
import { Path } from '../types/Path.js';

export class HalftoneOperation {
  generate(imageData, config = {}) {
    const toolpath = new Toolpath('halftone', { ...config });
    const cellSize = config.cellSize || 0.1;
    const startZ = config.startZ || 0;
    const maxDepth = config.maxDepth || -1;
    const offsetX = config.offsetX || 0;
    const offsetY = config.offsetY || 0;
    const dotSize = config.dotSize || 0.5;
    const spacing = config.dotSpacing || 1.0;
    const invert = config.invert || false;
    const stepPx = Math.max(1, Math.floor(spacing / cellSize));
    for (let y = 0; y < imageData.height; y += stepPx) {
      for (let x = 0; x < imageData.width; x += stepPx) {
        const idx = (y * imageData.width + x) * 4;
        const luma = 0.2126 * imageData.data[idx] + 0.7152 * imageData.data[idx + 1] + 0.0722 * imageData.data[idx + 2];
        const tone = invert ? 255 - luma : luma;
        const radius = dotSize * (1 - tone / 255) * 0.5;
        if (radius <= 0.001) continue;
        const z = startZ + (tone / 255) * (maxDepth - startZ);
        const cx = x * cellSize + offsetX;
        const cy = y * cellSize + offsetY;
        const points = [];
        for (let i = 0; i <= 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          points.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a), z });
        }
        toolpath.addPath(new Path(points, true), 0);
      }
    }
    toolpath.metadata.inputType = 'bitmap';
    toolpath.computeBounds();
    return toolpath;
  }
}
