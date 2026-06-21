function dist(x1, y1, x2, y2) {
  return Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1));
}

function pathIsClosed(clipperPath) {
  return clipperPath.length >= 2 &&
    clipperPath[0].X === clipperPath[clipperPath.length - 1].X &&
    clipperPath[0].Y === clipperPath[clipperPath.length - 1].Y;
}

function closeClipperPaths(paths) {
  for (let i = 0; i < paths.length; ++i)
    paths[i].push(paths[i][0]);
}

function crosses(bounds, p1, p2, ClipperLib) {
  if (bounds === null) return true;
  if (p1.X === p2.X && p1.Y === p2.Y) return false;
  const clipper = new ClipperLib.Clipper();
  clipper.AddPath([p1, p2], ClipperLib.PolyType.ptSubject, false);
  clipper.AddPaths(bounds, ClipperLib.PolyType.ptClip, true);
  const result = new ClipperLib.PolyTree();
  clipper.Execute(ClipperLib.ClipType.ctIntersection, result,
    ClipperLib.PolyFillType.pftEvenOdd, ClipperLib.PolyFillType.pftEvenOdd);
  if (result.ChildCount() === 1) {
    const child = result.Childs()[0];
    const points = child.Contour();
    if (points.length === 2) {
      if (points[0].X === p1.X && points[1].X === p2.X &&
          points[0].Y === p1.Y && points[1].Y === p2.Y) return false;
      if (points[0].X === p2.X && points[1].X === p1.X &&
          points[0].Y === p2.Y && points[1].Y === p1.Y) return false;
    }
  }
  return true;
}

function mat3_fromTranslation(m, v) {
  m[0]=1; m[1]=0; m[2]=0; m[3]=0; m[4]=1; m[5]=0; m[6]=v[0]; m[7]=v[1]; m[8]=1;
  return m;
}

function mat3_rotate(m, rad) {
  var s=Math.sin(rad), c=Math.cos(rad);
  var m0=m[0], m1=m[1], m2=m[2], m3=m[3], m4=m[4], m5=m[5];
  m[0]=m0*c+m3*s; m[1]=m1*c+m4*s; m[2]=m2*c+m5*s;
  m[3]=-m0*s+m3*c; m[4]=-m1*s+m4*c; m[5]=-m2*s+m5*c;
  return m;
}

function mat3_translate(m, v) {
  m[6] += m[0]*v[0] + m[3]*v[1];
  m[7] += m[1]*v[0] + m[4]*v[1];
  m[8] += m[2]*v[0] + m[5]*v[1];
  return m;
}

function vec2_transformMat3(out, v, m) {
  var x=v[0], y=v[1];
  out[0] = m[0]*x + m[3]*y + m[6];
  out[1] = m[1]*x + m[4]*y + m[7];
  return out;
}

function normalizeVec(x, y) {
  const len = Math.hypot(x, y);
  if (len <= 1e-12) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function projectPoint(point, origin, axisX, axisY) {
  const dx = point.X - origin.X;
  const dy = point.Y - origin.Y;
  return {
    x: dx * axisX.x + dy * axisX.y,
    y: dx * axisY.x + dy * axisY.y
  };
}

function unprojectPoint(local, origin, axisX, axisY) {
  return {
    X: origin.X + axisX.x * local.x + axisY.x * local.y,
    Y: origin.Y + axisX.y * local.x + axisY.y * local.y
  };
}

export class CamCore {
  constructor(clipper) {
    this.clipper = clipper;
  }

  get C() { return this.clipper.C; }

  dist(x1, y1, x2, y2) { return dist(x1, y1, x2, y2); }
  pathIsClosed(p) { return pathIsClosed(p); }
  closeClipperPaths(paths) { closeClipperPaths(paths); }

  mergePaths(bounds, paths) {
    const C = this.C;
    if (paths.length === 0) return [];
    let currentPath = paths[0];
    if (pathIsClosed(currentPath)) currentPath.push(currentPath[0]);
    let currentPoint = currentPath[currentPath.length - 1];
    paths[0] = [];
    const mergedPaths = [];
    let numLeft = paths.length - 1;
    while (numLeft > 0) {
      let closestPathIndex = null, closestPointIndex = null;
      let closestPointDist = null, closestReverse = false;
      for (let pathIndex = 0; pathIndex < paths.length; ++pathIndex) {
        const path = paths[pathIndex];
        const check = (pointIndex) => {
          const point = path[pointIndex];
          const d = (currentPoint.X - point.X) * (currentPoint.X - point.X) +
                    (currentPoint.Y - point.Y) * (currentPoint.Y - point.Y);
          if (closestPointDist === null || d < closestPointDist) {
            closestPathIndex = pathIndex;
            closestPointIndex = pointIndex;
            closestPointDist = d;
            closestReverse = false;
            return true;
          }
          return false;
        };
        if (pathIsClosed(path)) {
          for (let pointIndex = 0; pointIndex < path.length; ++pointIndex)
            check(pointIndex);
        } else if (path.length) {
          if (check(0)) closestReverse = false;
          if (check(path.length - 1)) closestReverse = true;
        }
      }
      let path = paths[closestPathIndex];
      paths[closestPathIndex] = [];
      numLeft -= 1;
      let needNew;
      if (pathIsClosed(path)) {
        needNew = crosses(bounds, currentPoint, path[closestPointIndex], C);
        path = path.slice(closestPointIndex, path.length).concat(path.slice(1, closestPointIndex));
        path.push(path[0]);
      } else {
        needNew = true;
        if (closestReverse) { path = path.slice(); path.reverse(); }
      }
      if (needNew) {
        mergedPaths.push(currentPath);
        currentPath = path;
        currentPoint = currentPath[currentPath.length - 1];
      } else {
        currentPath = currentPath.concat(path);
        currentPoint = currentPath[currentPath.length - 1];
      }
    }
    mergedPaths.push(currentPath);
    return mergedPaths.map(p => ({
      path: p,
      safeToClose: !crosses(bounds, p[0], p[p.length - 1], C)
    }));
  }

  pocket(geometry, cutterDia, stepover, climb) {
    stepover = stepover / 100;
    let current = this.clipper.offset(geometry, -cutterDia / 2);
    const bounds = current.slice(0);
    let allPaths = [];
    while (current.length !== 0) {
      if (!climb)
        for (let i = 0; i < current.length; ++i)
          current[i].reverse();
      allPaths = current.concat(allPaths);
      current = this.clipper.offset(current, -cutterDia * stepover);
    }
    closeClipperPaths(allPaths);
    return this.mergePaths(bounds, allPaths);
  }

  insideOutside(geometry, cutterDia, isInside, width, stepover, climb, allowRecutInBounds) {
    stepover = stepover / 100;
    width = Math.max(width, cutterDia);
    let currentWidth = cutterDia;
    let allPaths = [];
    const eachWidth = cutterDia * stepover;
    let current, bounds = null, eachOffset, needReverse;
    if (isInside) {
      current = this.clipper.offset(geometry, -cutterDia / 2);
      if (allowRecutInBounds)
        bounds = this.clipper.diff(current, this.clipper.offset(geometry, -(width - cutterDia / 2)));
      eachOffset = -eachWidth;
      needReverse = !climb;
    } else {
      current = this.clipper.offset(geometry, cutterDia / 2);
      if (allowRecutInBounds)
        bounds = this.clipper.diff(this.clipper.offset(geometry, width - cutterDia / 2), current);
      eachOffset = eachWidth;
      needReverse = climb;
    }
    while (currentWidth <= width) {
      if (needReverse)
        for (let i = 0; i < current.length; ++i)
          current[i].reverse();
      allPaths = current.concat(allPaths);
      const nextWidth = currentWidth + eachWidth;
      if (nextWidth > width && width - currentWidth > 0) {
        current = this.clipper.offset(current, width - currentWidth);
        if (needReverse)
          for (let i = 0; i < current.length; ++i)
            current[i].reverse();
        allPaths = current.concat(allPaths);
        break;
      }
      currentWidth = nextWidth;
      if (currentWidth <= width)
        current = this.clipper.offset(current, eachOffset);
    }
    closeClipperPaths(allPaths);
    return this.mergePaths(bounds, allPaths);
  }

  cut(geometry, openGeometry, climb) {
    const allPaths = [];
    for (let i = 0; i < geometry.length; ++i) {
      const path = geometry[i].slice(0);
      if (climb) path.reverse();
      path.push(path[0]);
      allPaths.push(path);
    }
    for (let i = 0; i < openGeometry.length; ++i)
      allPaths.push(openGeometry[i].slice());
    const result = this.mergePaths(null, allPaths);
    for (let i = 0; i < result.length; ++i)
      result[i].safeToClose = pathIsClosed(result[i].path);
    return result;
  }

  fillPath(geometry, lineDistance, angle) {
    if (!geometry.length || !geometry[0].length) return [];
    const bounds = this.clipper.clipperBounds(geometry);
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const r = dist(cx, cy, bounds.minX, bounds.minY) + lineDistance;
    let m = mat3_fromTranslation([], [cx, cy]);
    m = mat3_rotate(m, angle * Math.PI / 180);
    m = mat3_translate(m, [-cx, -cy]);
    const makePoint = (x, y) => {
      const p = vec2_transformMat3([], [x, y], m);
      return { X: p[0], Y: p[1] };
    };
    const allPaths = [];
    for (let y = cy - r; y < cy + r; y += lineDistance * 2) {
      const rect = [
        makePoint(cx - r, y),
        makePoint(cx + r, y),
        makePoint(cx + r, y + lineDistance),
        makePoint(cx - r, y + lineDistance)
      ];
      const clipped = this.clipper.intersection([rect], geometry);
      if (!clipped.length) continue;
      const axisX = normalizeVec(rect[1].X - rect[0].X, rect[1].Y - rect[0].Y);
      const axisY = normalizeVec(rect[3].X - rect[0].X, rect[3].Y - rect[0].Y);
      for (const poly of clipped) {
        if (!poly || poly.length < 2) continue;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        for (const point of poly) {
          const local = projectPoint(point, rect[0], axisX, axisY);
          if (local.x < minX) minX = local.x;
          if (local.x > maxX) maxX = local.x;
          if (local.y < minY) minY = local.y;
          if (local.y > maxY) maxY = local.y;
        }
        if (!(maxX > minX)) continue;
        const centerY = (minY + maxY) / 2;
        allPaths.push([
          unprojectPoint({ x: minX, y: centerY }, rect[0], axisX, axisY),
          unprojectPoint({ x: maxX, y: centerY }, rect[0], axisX, axisY)
        ]);
      }
    }
    return this.mergePaths(null, allPaths);
  }

  separateTabsClipper(cutterPath, tabGeometry) {
    if (tabGeometry.length === 0) return [cutterPath];
    const C = this.C;
    const clipper = new C.Clipper();
    clipper.AddPath(cutterPath, C.PolyType.ptSubject, false);
    clipper.AddPaths(tabGeometry, C.PolyType.ptClip, true);
    const result = new C.PolyTree();
    clipper.Execute(C.ClipType.ctDifference, result,
      C.PolyFillType.pftEvenOdd, C.PolyFillType.pftEvenOdd);
    const extracted = [];
    const collect = (node) => {
      const contour = node.Contour();
      if (contour.length) extracted.push(contour);
      for (let i = 0; i < node.ChildCount(); i++)
        collect(node.Childs()[i]);
    };
    collect(result);
    return extracted;
  }

  reduceCamPaths(camPaths, minDist) {
    if (!(minDist > 0)) return;
    const minDistSqr = minDist * minDist;
    const distSqr = (p1, p2) =>
      (p1.X - p2.X) * (p1.X - p2.X) + (p1.Y - p2.Y) * (p1.Y - p2.Y);
    for (let i = 0; i < camPaths.length; ++i) {
      const camPath = camPaths[i];
      const path = camPath.path;
      const newPath = [path[0]];
      for (let j = 1; j < path.length - 1; ++j) {
        const sq = distSqr(path[j], newPath[newPath.length - 1]);
        if (sq > 0 && sq >= minDistSqr)
          newPath.push(path[j]);
      }
      newPath.push(path[path.length - 1]);
      camPath.path = newPath;
    }
  }

  getClipperPathsFromCamPaths(paths) {
    const result = [];
    if (paths !== null)
      for (let i = 0; i < paths.length; ++i)
        result.push(paths[i].path);
    return result;
  }
}
