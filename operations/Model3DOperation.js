import { Toolpath } from '../types/Toolpath.js';
import { Path } from '../types/Path.js';
import { ClipperAdapter } from '../adapters/ClipperAdapter.js';

export class Model3DOperation {
  constructor() {
    this.clipper = new ClipperAdapter();
  }

  generate(mesh, config) {
    const strategy = config.strategy || 'raster';
    if (strategy === 'parallel') {
      return this._generateParallel(mesh, config);
    }
    return this._generateRaster(mesh, config);
  }

  _generateRaster(mesh, config) {
    const tp = new Toolpath('model3d', config);
    const toolDia = config.toolDiameter || 3.175;
    const stepover = (config.stepover || 0.3) * toolDia;
    const zStep = config.zStep || 0.5;
    const vertices = this._getVertices(mesh);
    if (!vertices.length) return tp;
    const bounds = this._getBounds(vertices);
    if (!bounds) return tp;
    const nLayers = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / zStep));
    for (let layer = 0; layer < nLayers; layer++) {
      const z = bounds.maxZ - (layer + 1) * zStep;
      const sliceVertices = this._sliceAtZ(vertices, z, z + zStep);
      if (!sliceVertices.length) continue;
      const sliceBounds = this._getBounds(sliceVertices);
      if (!sliceBounds) continue;
      const w = sliceBounds.maxX - sliceBounds.minX;
      const h = sliceBounds.maxY - sliceBounds.minY;
      const nLinesX = Math.ceil(w / stepover);
      const nLinesY = Math.ceil(h / stepover);
      for (let i = 0; i <= nLinesX; i++) {
        const x = sliceBounds.minX + i * stepover;
        const zAtX = this._interpolateZ(sliceVertices, x, null);
        if (zAtX === null) continue;
        const pts = [
          { x, y: sliceBounds.minY, z: -zAtX },
          { x, y: sliceBounds.maxY, z: -zAtX }
        ];
        const path = new Path(pts, false);
        tp.addPath(path, layer);
      }
      for (let i = 0; i <= nLinesY; i++) {
        const y = sliceBounds.minY + i * stepover;
        const zAtY = this._interpolateZ(sliceVertices, null, y);
        if (zAtY === null) continue;
        const pts = [
          { x: sliceBounds.minX, y, z: -zAtY },
          { x: sliceBounds.maxX, y, z: -zAtY }
        ];
        const path = new Path(pts, false);
        tp.addPath(path, layer);
      }
    }
    tp.metadata.inputType = 'mesh';
    tp.metadata.vertexCount = vertices.length;
    tp.computeBounds();
    return tp;
  }

  _generateParallel(mesh, config) {
    const tp = new Toolpath('model3d', { ...config, strategy: 'parallel' });
    const toolDia = config.toolDiameter || 3.175;
    const stepover = (config.stepover || 0.3) * toolDia;
    const vertices = this._getVertices(mesh);
    if (!vertices.length) return tp;
    const bounds = this._getBounds(vertices);
    if (!bounds) return tp;
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const diag = Math.sqrt(w * w + h * h);
    const cx = bounds.minX + w / 2;
    const cy = bounds.minY + h / 2;
    const nLines = Math.ceil(diag / stepover);
    for (let i = 0; i <= nLines; i++) {
      const t = -diag / 2 + i * stepover;
      const pts = [];
      for (let d = -diag / 2; d <= diag / 2; d += 0.5) {
        const x = cx + t - d;
        const y = cy + t + d;
        const z = this._sampleMeshZ(vertices, x, y);
        if (z !== null) {
          pts.push({ x, y, z: -z });
        }
      }
      if (pts.length > 1) {
        const path = new Path(pts, false);
        tp.addPath(path, 0);
      }
    }
    tp.metadata.inputType = 'mesh';
    tp.computeBounds();
    return tp;
  }

  _getVertices(mesh) {
    if (mesh.attributes && mesh.attributes.position) {
      const pos = mesh.attributes.position;
      const verts = [];
      for (let i = 0; i < pos.count; i++) {
        verts.push({
          x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i)
        });
      }
      return verts;
    }
    if (Array.isArray(mesh.vertices)) return mesh.vertices;
    if (Array.isArray(mesh)) return mesh;
    return [];
  }

  _getBounds(vertices) {
    if (!vertices.length) return null;
    let minX, minY, minZ, maxX, maxY, maxZ;
    minX = maxX = vertices[0].x;
    minY = maxY = vertices[0].y;
    minZ = maxZ = vertices[0].z || 0;
    for (const v of vertices) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if ((v.z || 0) < minZ) minZ = v.z || 0;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
      if ((v.z || 0) > maxZ) maxZ = v.z || 0;
    }
    return { minX, minY, minZ, maxX, maxY, maxZ };
  }

  _sliceAtZ(vertices, zMin, zMax) {
    return vertices.filter(v => {
      const vz = v.z || 0;
      return vz >= zMin && vz <= zMax;
    });
  }

  _interpolateZ(vertices, x, y) {
    if (!vertices.length) return null;
    let closest = null;
    let minDist = Infinity;
    for (const v of vertices) {
      const dx = x !== null ? v.x - x : 0;
      const dy = y !== null ? v.y - y : 0;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) {
        minDist = d;
        closest = v;
      }
    }
    return closest ? (closest.z || 0) : null;
  }

  _sampleMeshZ(vertices, x, y) {
    return this._interpolateZ(vertices, x, y);
  }
}
