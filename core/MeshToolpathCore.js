import { Toolpath } from '../types/Toolpath.js';
import { Path } from '../types/Path.js';
import { ClipperAdapter } from '../adapters/ClipperAdapter.js';

function dist2(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export class MeshToolpathCore {
  constructor() {
    this.clipper = new ClipperAdapter();
    this.scale = this.clipper.mmToClipperScale;
  }

  getTriangles(mesh) {
    if (Array.isArray(mesh) && mesh.length && Array.isArray(mesh[0])) return mesh;
    if (Array.isArray(mesh) && mesh.length % 9 === 0) {
      const triangles = [];
      for (let i = 0; i < mesh.length; i += 9) {
        triangles.push([
          { x: mesh[i], y: mesh[i + 1], z: mesh[i + 2] },
          { x: mesh[i + 3], y: mesh[i + 4], z: mesh[i + 5] },
          { x: mesh[i + 6], y: mesh[i + 7], z: mesh[i + 8] }
        ]);
      }
      return triangles;
    }
    if (mesh?.vertices && Array.isArray(mesh.vertices)) {
      const triangles = [];
      for (let i = 0; i < mesh.vertices.length; i += 3) {
        triangles.push([mesh.vertices[i], mesh.vertices[i + 1], mesh.vertices[i + 2]]);
      }
      return triangles;
    }
    return [];
  }

  getBounds(triangles) {
    if (!triangles.length) return null;
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const tri of triangles) {
      for (const point of tri) {
        if (point.x < minX) minX = point.x;
        if (point.y < minY) minY = point.y;
        if (point.z < minZ) minZ = point.z;
        if (point.x > maxX) maxX = point.x;
        if (point.y > maxY) maxY = point.y;
        if (point.z > maxZ) maxZ = point.z;
      }
    }
    return { minX, minY, minZ, maxX, maxY, maxZ, width: maxX - minX, height: maxY - minY, depth: maxZ - minZ };
  }

  sliceTrianglesAtZ(triangles, z, tolerance = 1e-6) {
    const segments = [];
    for (const tri of triangles) {
      const hits = [];
      for (let edge = 0; edge < 3; edge++) {
        const a = tri[edge];
        const b = tri[(edge + 1) % 3];
        const da = a.z - z;
        const db = b.z - z;
        if (Math.abs(da) <= tolerance && Math.abs(db) <= tolerance) continue;
        if (Math.abs(da) <= tolerance) hits.push({ x: a.x, y: a.y });
        else if (Math.abs(db) <= tolerance) hits.push({ x: b.x, y: b.y });
        else if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
          const t = (z - a.z) / (b.z - a.z);
          hits.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
      }
      const unique = [];
      for (const hit of hits) {
        if (!unique.some(other => dist2(hit, other) <= tolerance * tolerance)) unique.push(hit);
      }
      if (unique.length >= 2) segments.push([unique[0], unique[1]]);
    }
    return segments;
  }

  linkSegmentsToLoops(segments, tolerance = 1e-4) {
    const unused = segments.slice();
    const loops = [];
    while (unused.length) {
      const seed = unused.pop();
      const loop = [seed[0], seed[1]];
      let progress = true;
      while (progress) {
        progress = false;
        const head = loop[0];
        const tail = loop[loop.length - 1];
        for (let i = unused.length - 1; i >= 0; i--) {
          const [a, b] = unused[i];
          if (dist2(tail, a) <= tolerance * tolerance) {
            loop.push(b);
          } else if (dist2(tail, b) <= tolerance * tolerance) {
            loop.push(a);
          } else if (dist2(head, b) <= tolerance * tolerance) {
            loop.unshift(a);
          } else if (dist2(head, a) <= tolerance * tolerance) {
            loop.unshift(b);
          } else {
            continue;
          }
          unused.splice(i, 1);
          progress = true;
          break;
        }
      }
      if (loop.length >= 3) loops.push(loop);
    }
    return loops;
  }

  loopsToClipper(loops) {
    return loops.map(loop => loop.map(point => ({
      X: Math.round(point.x * this.scale),
      Y: Math.round(point.y * this.scale)
    })));
  }

  projectTrianglesToClipper(triangles) {
    return triangles
      .filter(triangle => Array.isArray(triangle) && triangle.length === 3)
      .map(triangle => triangle.map(point => ({
        X: Math.round(point.x * this.scale),
        Y: Math.round(point.y * this.scale)
      })));
  }

  unionProjectedTriangles(triangles) {
    const projected = this.projectTrianglesToClipper(triangles)
      .filter(path => path.length >= 3 && Math.abs(this.clipper.area(path)) > 1);
    if (!projected.length) return [];
    let current = [projected[0]];
    for (let i = 1; i < projected.length; i++) {
      current = this.clipper.union(current, [projected[i]]);
    }
    return this.clipper.clean(this.clipper.simplify(current));
  }

  clipperToPaths(clipperPaths, z, closed = true) {
    return clipperPaths.map(path => new Path(path.map(point => ({
      x: point.X / this.scale,
      y: point.Y / this.scale,
      z
    })), closed));
  }

  createToolpath(operationType, config) {
    return new Toolpath(operationType, { ...config });
  }
}
