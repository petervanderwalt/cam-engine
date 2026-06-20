import { Toolpath } from '../types/Toolpath.js';
import { Path } from '../types/Path.js';

function distance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalize(vx, vy) {
  const len = Math.hypot(vx, vy);
  if (len <= 1e-9) return null;
  return { x: vx / len, y: vy / len };
}

function sameXY(a, b, tolerance = 1e-9) {
  return Math.abs(a.x - b.x) <= tolerance && Math.abs(a.y - b.y) <= tolerance;
}

function dedupePoints(points) {
  const result = [];
  for (const point of points) {
    if (!result.length || !sameXY(result[result.length - 1], point) || Math.abs((result[result.length - 1].z ?? 0) - (point.z ?? 0)) > 1e-9) {
      result.push(point);
    }
  }
  return result;
}

function pathToPoints(pathLike) {
  if (pathLike instanceof Path) return pathLike.points.map(point => ({ ...point }));
  if (Array.isArray(pathLike)) {
    return pathLike.map(point => ({
      x: typeof point.x === 'number' ? point.x : point.X,
      y: typeof point.y === 'number' ? point.y : point.Y,
      z: typeof point.z === 'number' ? point.z : (point.Z || 0)
    }));
  }
  return (pathLike?.points || []).map(point => ({ ...point }));
}

export class DragKnifeOperation {
  generate(inputPaths, config = {}) {
    const toolpath = new Toolpath('drag-knife', { ...config });
    const bladeOffset = Math.max(0, config.bladeOffset || 0.25);
    const swivelToleranceDeg = config.swivelToleranceDeg ?? 5;
    const swivelToleranceRad = swivelToleranceDeg * Math.PI / 180;
    const swivelSegments = Math.max(3, Math.trunc(config.swivelSegments || 12));
    const z = Number.isFinite(config.z) ? config.z : 0;
    let pathIndex = 0;

    for (const inputPath of inputPaths || []) {
      const sourcePoints = pathToPoints(inputPath);
      const closed = inputPath instanceof Path ? inputPath.closed : !!inputPath?.closed;
      const compensated = this.buildCompensatedPath(sourcePoints, {
        closed,
        bladeOffset,
        swivelToleranceRad,
        swivelSegments,
        z
      });
      if (compensated.length < 2) continue;
      toolpath.addPath(new Path(compensated, false), pathIndex);
      pathIndex += 1;
    }

    toolpath.metadata.inputType = 'vector';
    toolpath.metadata.bladeOffset = bladeOffset;
    toolpath.computeBounds();
    return toolpath;
  }

  buildCompensatedPath(points, options) {
    const cleaned = this.cleanPoints(points, options.closed);
    if (cleaned.length < 2) return [];
    const chain = options.closed ? cleaned.concat([{ ...cleaned[0] }]) : cleaned;
    const tangents = [];

    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i];
      const b = chain[i + 1];
      const tangent = normalize(b.x - a.x, b.y - a.y);
      if (tangent) tangents.push(tangent);
    }
    if (!tangents.length) return [];

    const result = [];
    const start = chain[0];
    result.push({
      x: start.x - tangents[0].x * options.bladeOffset,
      y: start.y - tangents[0].y * options.bladeOffset,
      z: options.z
    });

    for (let i = 1; i < chain.length - 1; i++) {
      const pivot = chain[i];
      const incoming = tangents[i - 1];
      const outgoing = tangents[i];
      const entry = {
        x: pivot.x - incoming.x * options.bladeOffset,
        y: pivot.y - incoming.y * options.bladeOffset,
        z: options.z
      };
      result.push(entry);

      const angleIn = Math.atan2(-incoming.y, -incoming.x);
      const angleOut = Math.atan2(-outgoing.y, -outgoing.x);
      let delta = angleOut - angleIn;
      while (delta <= -Math.PI) delta += Math.PI * 2;
      while (delta > Math.PI) delta -= Math.PI * 2;
      if (Math.abs(delta) <= options.swivelToleranceRad) continue;

      for (let step = 1; step < options.swivelSegments; step++) {
        const t = step / options.swivelSegments;
        const angle = angleIn + delta * t;
        result.push({
          x: pivot.x + Math.cos(angle) * options.bladeOffset,
          y: pivot.y + Math.sin(angle) * options.bladeOffset,
          z: options.z
        });
      }

      result.push({
        x: pivot.x - outgoing.x * options.bladeOffset,
        y: pivot.y - outgoing.y * options.bladeOffset,
        z: options.z
      });
    }

    const end = chain[chain.length - 1];
    const lastTangent = tangents[tangents.length - 1];
    result.push({
      x: end.x - lastTangent.x * options.bladeOffset,
      y: end.y - lastTangent.y * options.bladeOffset,
      z: options.z
    });

    return dedupePoints(result);
  }

  cleanPoints(points, closed) {
    const result = [];
    for (const point of points) {
      if (!result.length || distance(result[result.length - 1], point) > 1e-9) {
        result.push({ x: point.x, y: point.y, z: point.z || 0 });
      }
    }
    if (closed && result.length > 2 && sameXY(result[0], result[result.length - 1])) {
      result.pop();
    }
    return result;
  }
}
