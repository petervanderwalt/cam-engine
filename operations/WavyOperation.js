import { Toolpath } from '../types/Toolpath.js';
import { Path } from '../types/Path.js';

export class WavyOperation {
  generate(imageData, config = {}) {
    const toolpath = new Toolpath('wavy', { ...config });
    const cellSize = (config.imageWidthMm || 50) / imageData.width;
    const startZ = config.startZ || 0;
    const maxDepth = config.maxDepth || -1;
    const offsetX = config.offsetX || 0;
    const offsetY = config.offsetY || 0;
    const direction = config.direction || 'top_to_bottom';
    const invert = config.invert || false;
    const yStart = direction === 'bottom_to_top' ? imageData.height - 1 : 0;
    const yEnd = direction === 'bottom_to_top' ? -1 : imageData.height;
    const yStep = direction === 'bottom_to_top' ? -1 : 1;
    for (let y = yStart; y !== yEnd; y += yStep) {
      const scanLeft = Math.floor(Math.abs(y - yStart)) % 2 === 0;
      const xStart = scanLeft ? 0 : imageData.width - 1;
      const xEnd = scanLeft ? imageData.width : -1;
      const xStep = scanLeft ? 1 : -1;
      const points = [];
      for (let x = xStart; x !== xEnd; x += xStep) {
        const idx = (y * imageData.width + x) * 4;
        const luma = 0.2126 * imageData.data[idx] + 0.7152 * imageData.data[idx + 1] + 0.0722 * imageData.data[idx + 2];
        const tone = invert ? 255 - luma : luma;
        points.push({
          x: x * cellSize + offsetX,
          y: (imageData.height - 1 - y) * cellSize + offsetY,
          z: startZ + (tone / 255) * (maxDepth - startZ)
        });
      }
      if (points.length > 1) toolpath.addPath(new Path(points, false), 0);
    }
    toolpath.metadata.inputType = 'bitmap';
    toolpath.computeBounds();
    return toolpath;
  }
}
