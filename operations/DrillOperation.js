import { Toolpath } from '../types/Toolpath.js';
import { Path } from '../types/Path.js';

export class DrillOperation {
  generate(inputPaths, config) {
    const tp = new Toolpath('drill', config);
    const mode = config.mode || 'peck';
    const zStart = config.zStart || 0;
    const zDepth = config.zDepth || -3;
    const zStep = config.zStep || 1;
    const dwell = config.dwell || 0;
    const centers = this._findCenters(inputPaths);
    for (const center of centers) {
      if (mode === 'peck') {
        let z = zStart;
        while (z > zDepth) {
          z = Math.max(z - zStep, zDepth);
          const pts = [
            { x: center.x, y: center.y, z: zStart },
            { x: center.x, y: center.y, z }
          ];
          const path = new Path(pts, false);
          tp.addPath(path, 0);
          if (z > zDepth) {
            const retract = [
              { x: center.x, y: center.y, z },
              { x: center.x, y: center.y, z: zStart }
            ];
            tp.addPath(new Path(retract, false), 0);
          }
        }
      } else {
        const pts = [
          { x: center.x, y: center.y, z: zStart },
          { x: center.x, y: center.y, z: zDepth }
        ];
        const path = new Path(pts, false);
        tp.addPath(path, 0);
      }
      if (dwell > 0) {
        tp.metadata.dwell = dwell;
      }
    }
    tp.metadata.holeCount = centers.length;
    tp.metadata.drillMode = mode;
    tp.computeBounds();
    return tp;
  }

  _findCenters(paths) {
    const centers = [];
    for (const path of paths) {
      if (path.points.length === 0) continue;
      let cx = 0, cy = 0;
      for (const pt of path.points) {
        cx += pt.x;
        cy += pt.y;
      }
      cx /= path.points.length;
      cy /= path.points.length;
      centers.push({ x: cx, y: cy });
    }
    return centers;
  }
}
