export function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getRawPathsBounds(rawPaths) {
  var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (var pi = 0; pi < rawPaths.length; pi++) {
    var p = rawPaths[pi];
    for (var vi = 0; vi < p.length; vi += 2) {
      var px = p[vi], py = p[vi + 1];
      if (px < x1) x1 = px;
      if (py < y1) y1 = py;
      if (px > x2) x2 = px;
      if (py > y2) y2 = py;
    }
  }
  return { x1: x1, y1: y1, x2: x2, y2: y2 };
}

export function transformBounds(bounds, t) {
  var corners = [
    { x: bounds.x1, y: bounds.y1 },
    { x: bounds.x2, y: bounds.y1 },
    { x: bounds.x2, y: bounds.y2 },
    { x: bounds.x1, y: bounds.y2 }
  ];
  var wb = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  for (var i = 0; i < 4; i++) {
    var wx = t[0] * corners[i].x + t[2] * corners[i].y + t[4];
    var wy = t[1] * corners[i].x + t[3] * corners[i].y + t[5];
    if (wx < wb.x1) wb.x1 = wx;
    if (wy < wb.y1) wb.y1 = wy;
    if (wx > wb.x2) wb.x2 = wx;
    if (wy > wb.y2) wb.y2 = wy;
  }
  return wb;
}
