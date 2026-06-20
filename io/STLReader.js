export class STLReader {
  read(buffer) {
    if (buffer.byteLength < 84) {
      throw new Error('Invalid STL file: too small');
    }
    const header = new Uint8Array(buffer, 0, 80);
    const headerStr = new TextDecoder().decode(header);
    const isAscii = headerStr.trim().startsWith('solid');
    if (isAscii) {
      return this._readAscii(buffer);
    }
    return this._readBinary(buffer);
  }

  _readBinary(buffer) {
    const dv = new DataView(buffer);
    const nTriangles = dv.getUint32(80, true);
    const expectedSize = 84 + nTriangles * 50;
    if (buffer.byteLength < expectedSize) {
      throw new Error('STL binary: truncated file');
    }
    const vertices = [];
    const normals = [];
    for (let i = 0; i < nTriangles; i++) {
      const offset = 84 + i * 50;
      const nx = dv.getFloat32(offset, true);
      const ny = dv.getFloat32(offset + 4, true);
      const nz = dv.getFloat32(offset + 8, true);
      for (let j = 0; j < 3; j++) {
        const voff = offset + 12 + j * 12;
        const x = dv.getFloat32(voff, true);
        const y = dv.getFloat32(voff + 4, true);
        const z = dv.getFloat32(voff + 8, true);
        vertices.push({ x, y, z });
        if (j === 0) normals.push({ x: nx, y: ny, z: nz });
      }
    }
    return {
      vertices,
      normals,
      triangles: nTriangles,
      format: 'binary'
    };
  }

  _readAscii(buffer) {
    const text = new TextDecoder().decode(buffer);
    const vertices = [];
    const normals = [];
    const lines = text.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      i++;
      if (line.startsWith('facet normal')) {
        const parts = line.split(/\s+/);
        const nx = parseFloat(parts[2]);
        const ny = parseFloat(parts[3]);
        const nz = parseFloat(parts[4]);
        normals.push({ x: nx, y: ny, z: nz });
        for (let j = 0; j < 3; j++) {
          while (i < lines.length) {
            const vl = lines[i].trim();
            i++;
            if (vl.startsWith('vertex')) {
              const vp = vl.split(/\s+/);
              vertices.push({
                x: parseFloat(vp[1]),
                y: parseFloat(vp[2]),
                z: parseFloat(vp[3])
              });
              break;
            }
          }
        }
        while (i < lines.length) {
          const cl = lines[i].trim();
          i++;
          if (cl.startsWith('endfacet')) break;
        }
      }
    }
    return {
      vertices,
      normals,
      triangles: Math.floor(vertices.length / 3),
      format: 'ascii'
    };
  }

  readFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(this.read(reader.result));
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsArrayBuffer(file);
    });
  }

  meshToThreeJS(stlData) {
    if (typeof THREE === 'undefined') {
      throw new Error('THREE not available for mesh conversion');
    }
    const geom = new THREE.Geometry();
    for (const v of stlData.vertices) {
      geom.vertices.push(new THREE.Vector3(v.x, v.y, v.z));
    }
    for (let i = 0; i < stlData.triangles; i++) {
      const face = new THREE.Face3(i * 3, i * 3 + 1, i * 3 + 2);
      if (stlData.normals[i]) {
        face.normal = new THREE.Vector3(
          stlData.normals[i].x,
          stlData.normals[i].y,
          stlData.normals[i].z
        );
      }
      geom.faces.push(face);
    }
    geom.computeFaceNormals();
    geom.computeVertexNormals();
    return geom;
  }
}
