import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import * as ClipperModule from 'https://cdn.jsdelivr.net/npm/js-clipper@1.0.1/+esm';
import { Engine, Path, Toolpath, GCodeWriter, ClipperAdapter, LayeredStepdownOperation, VCarveOperation } from '../index.js';

globalThis.ClipperLib = ClipperModule.default || ClipperModule.ClipperLib || ClipperModule;

const engine = new Engine();
const stepdown = new LayeredStepdownOperation();
const vcarveOp = new VCarveOperation();
const clipper = new ClipperAdapter();
const writer = new GCodeWriter();
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const threeHost = document.getElementById('threeViewport');

let currentCamPaths = [];
let currentToolpath = null;
let currentGCode = '';

const SHAPES = {
  square: () => [new Path([{ x: -25, y: -25, z: 0 }, { x: 25, y: -25, z: 0 }, { x: 25, y: 25, z: 0 }, { x: -25, y: 25, z: 0 }], true)],
  circle: () => { const pts = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; pts.push({ x: 25 * Math.cos(a), y: 25 * Math.sin(a), z: 0 }); } return [new Path(pts, true)]; },
  star: () => { const pts = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2; const r = i % 2 === 0 ? 25 : 10; pts.push({ x: r * Math.cos(a), y: r * Math.sin(a), z: 0 }); } return [new Path(pts, true)]; },
  rectangle: () => [new Path([{ x: -40, y: -20, z: 0 }, { x: 40, y: -20, z: 0 }, { x: 40, y: 20, z: 0 }, { x: -40, y: 20, z: 0 }], true)],
  ring: () => { const outer = []; const inner = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; outer.push({ x: 25 * Math.cos(a), y: 25 * Math.sin(a), z: 0 }); inner.push({ x: 12 * Math.cos(-a), y: 12 * Math.sin(-a), z: 0 }); } return [new Path(outer, true), new Path(inner, true)]; },
  cross: () => [new Path([{ x: -5, y: -25, z: 0 }, { x: 5, y: -25, z: 0 }, { x: 5, y: -5, z: 0 }, { x: 25, y: -5, z: 0 }, { x: 25, y: 5, z: 0 }, { x: 5, y: 5, z: 0 }, { x: 5, y: 25, z: 0 }, { x: -5, y: 25, z: 0 }, { x: -5, y: 5, z: 0 }, { x: -25, y: 5, z: 0 }, { x: -25, y: -5, z: 0 }, { x: -5, y: -5, z: 0 }], true)]
};

const CODE_EXAMPLES = {
  cut: `const camPaths = engine.cut(geometry, [], false);
const toolpath = applyDepthToCamPaths(camPaths, {
  zStart: 0,
  zEnd: -3,
  passDepth: 0.5
}, 'vector-cut');`,
  offsetInside: `const camPaths = engine.insideOutside(geometry, toolDia, true, cutWidth, 40, false, false);
const toolpath = applyDepthToCamPaths(camPaths, config, 'vector-inside');`,
  offsetOutside: `const camPaths = engine.insideOutside(geometry, toolDia, false, cutWidth, 40, false, false);
const toolpath = applyDepthToCamPaths(camPaths, config, 'vector-outside');`,
  pocket: `const camPaths = engine.pocket(geometry, toolDia, 40, false);
const toolpath = applyDepthToCamPaths(camPaths, config, 'vector-pocket');`,
  raster: `const camPaths = engine.fillPath(geometry, lineDistance, angle);
const toolpath = applyDepthToCamPaths(camPaths, config, 'vector-raster-fill');`,
  laser: `const camPaths = engine.cut(geometry, [], false);`,
  laserFill: `const camPaths = engine.fillPath(geometry, lineDistance, angle);`,
  vcarve: `const camPaths = vcarveOp.generate(paths, {
  cutterAngle: 60,
  passDepth: 0.5
});`
};

function withDepthFields(schema, defaults = {}) {
  return {
    ...schema,
    zStart: { label: 'Z start (mm)', default: defaults.zStart ?? 0, step: 0.1 },
    zEnd: { label: 'Z end (mm)', default: defaults.zEnd ?? 0, step: 0.1 },
    passDepth: { label: 'Pass depth (mm)', default: defaults.passDepth ?? 0.5, step: 0.1 },
    finishPassDepth: { label: 'Finish pass (mm)', default: defaults.finishPassDepth ?? 0, step: 0.1 },
    springPasses: { label: 'Spring passes', default: defaults.springPasses ?? 0, step: 1 }
  };
}

const OP_CONFIG = {
  cut: withDepthFields({ direction: { label: 'Direction', type: 'select', default: 'Conventional', options: ['Conventional', 'Climb'] }, segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } }, { zEnd: -3 }),
  offsetInside: withDepthFields({ toolDiameter: { label: 'Tool dia (mm)', default: 3.175, step: 0.1 }, cutWidth: { label: 'Cut width (mm)', default: 3.175, step: 0.1 }, stepOver: { label: 'Stepover %', default: 40, step: 5 }, direction: { label: 'Direction', type: 'select', default: 'Conventional', options: ['Conventional', 'Climb'] }, margin: { label: 'Margin (mm)', default: 0, step: 0.1 }, segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } }, { zEnd: -3 }),
  offsetOutside: withDepthFields({ toolDiameter: { label: 'Tool dia (mm)', default: 3.175, step: 0.1 }, cutWidth: { label: 'Cut width (mm)', default: 3.175, step: 0.1 }, stepOver: { label: 'Stepover %', default: 40, step: 5 }, direction: { label: 'Direction', type: 'select', default: 'Conventional', options: ['Conventional', 'Climb'] }, margin: { label: 'Margin (mm)', default: 0, step: 0.1 }, segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } }, { zEnd: -3 }),
  pocket: withDepthFields({ toolDiameter: { label: 'Tool dia (mm)', default: 3.175, step: 0.1 }, stepOver: { label: 'Stepover %', default: 40, step: 5 }, direction: { label: 'Direction', type: 'select', default: 'Conventional', options: ['Conventional', 'Climb'] }, margin: { label: 'Margin (mm)', default: 0, step: 0.1 }, segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } }, { zEnd: -3 }),
  raster: withDepthFields({ lineDistance: { label: 'Line spacing (mm)', default: 0.5, step: 0.1 }, angle: { label: 'Angle (deg)', default: 0, step: 15 }, segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } }, { zEnd: -1 }),
  laser: { segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } },
  laserFill: { lineDistance: { label: 'Line spacing (mm)', default: 0.5, step: 0.1 }, angle: { label: 'Angle (deg)', default: 0, step: 15 }, segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } },
  vcarve: { cutterAngle: { label: 'Cutter angle (deg)', default: 60, step: 5 }, passDepth: { label: 'Pass depth (mm)', default: 0.5, step: 0.1 }, segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } }
};

const three = { renderer: null, scene: null, camera: null, controls: null, pathGroup: null, shapeGroup: null };

function initThree() {
  three.renderer = new THREE.WebGLRenderer({ antialias: true });
  three.renderer.setPixelRatio(window.devicePixelRatio || 1);
  three.renderer.setClearColor(0x0d0d1a, 1);
  threeHost.appendChild(three.renderer.domElement);
  three.scene = new THREE.Scene();
  three.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
  three.camera.up.set(0, 0, 1);
  three.camera.position.set(100, -120, 90);
  three.controls = new OrbitControls(three.camera, three.renderer.domElement);
  three.controls.enableDamping = true;
  three.controls.target.set(0, 0, 0);
  three.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(120, -80, 160);
  three.scene.add(light);
  const grid = new THREE.GridHelper(220, 22, 0x335577, 0x1a2e48);
  grid.rotation.x = Math.PI / 2;
  three.scene.add(grid);
  three.shapeGroup = new THREE.Group();
  three.pathGroup = new THREE.Group();
  three.scene.add(three.shapeGroup);
  three.scene.add(three.pathGroup);
}

function animateThree() {
  requestAnimationFrame(animateThree);
  if (!three.renderer) return;
  three.controls.update();
  three.renderer.render(three.scene, three.camera);
}

function resize2DCanvas() {
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
  canvas._w = rect.width;
  canvas._h = rect.height;
}

function resizeThree() {
  const rect = threeHost.getBoundingClientRect();
  three.camera.aspect = rect.width / Math.max(rect.height, 1);
  three.camera.updateProjectionMatrix();
  three.renderer.setSize(rect.width, rect.height, false);
}

function getShapePaths() {
  return SHAPES[document.getElementById('shapeSelect').value]();
}

function buildConfig() {
  const cfg = {};
  for (const el of document.querySelectorAll('#configPanel [data-key]')) {
    cfg[el.dataset.key] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : parseFloat(el.value) || 0;
  }
  return cfg;
}

function configHtml(schema) {
  let html = '';
  for (const [key, field] of Object.entries(schema || {})) {
    html += '<div class="cfg-row">';
    html += `<label>${field.label}</label>`;
    if (field.type === 'select') {
      html += `<select data-key="${key}">`;
      for (const option of field.options) html += `<option value="${option}" ${option === field.default ? 'selected' : ''}>${option}</option>`;
      html += '</select>';
    } else {
      html += `<input type="number" data-key="${key}" value="${field.default}" step="${field.step || 0.1}">`;
    }
    html += '</div>';
  }
  return html;
}

function toClipperGeometry(paths) {
  return paths.map(path => path.toClipperPath());
}

function camPathsToToolpath(camPaths, operationType, config) {
  const toolpath = new Toolpath(operationType, config);
  const scale = 1 / clipper.mmToClipperScale;
  for (const camPath of camPaths) {
    const points = camPath.path.map(point => ({ x: point.X * scale, y: point.Y * scale, z: (point.Z || 0) * scale }));
    toolpath.addPath(new Path(points, !!camPath.safeToClose), 0);
  }
  toolpath.computeBounds();
  return toolpath;
}

function applyDepthToCamPaths(camPaths, config, operationType) {
  const zStart = Number.isFinite(config.zStart) ? config.zStart : 0;
  const zEnd = Number.isFinite(config.zEnd) ? config.zEnd : 0;
  if (Math.abs(zStart - zEnd) <= 1e-9) {
    return camPathsToToolpath(camPaths, operationType, config);
  }
  return stepdown.generateFromCamPaths(camPaths, {
    ...config,
    zStart,
    zEnd,
    passDepth: config.passDepth || 0.5,
    finishPassDepth: config.finishPassDepth || 0,
    springPasses: config.springPasses || 0
  }, operationType, { inputType: 'vector' });
}

function getBounds(points) {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if ((point.z || 0) < minZ) minZ = point.z || 0;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
    if ((point.z || 0) > maxZ) maxZ = point.z || 0;
  }
  return { minX, minY, minZ, maxX, maxY, maxZ, w: maxX - minX || 1, h: maxY - minY || 1, d: maxZ - minZ || 1 };
}

function collectPoints(paths) {
  const points = [];
  for (const path of paths) points.push(...path.points);
  return points;
}

function draw2D(inputShapes, toolpath) {
  resize2DCanvas();
  const w = canvas._w;
  const h = canvas._h;
  ctx.clearRect(0, 0, w, h);
  if (!toolpath) return;
  const bounds = getBounds([...collectPoints(inputShapes), ...collectPoints(toolpath.paths)]);
  if (!bounds) return;
  const scale = Math.min((w - 40) / bounds.w, (h - 40) / bounds.h);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, -scale);
  ctx.translate(-cx, -cy);
  ctx.strokeStyle = '#0f3460';
  ctx.lineWidth = 0.75 / scale;
  for (const path of inputShapes) {
    if (path.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i].x, path.points[i].y);
    if (path.closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth = 1.5 / scale;
  for (const path of toolpath.paths) {
    if (path.points.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(path.points[0].x, path.points[0].y);
    for (let i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i].x, path.points[i].y);
    if (path.closed) ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function clearGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    if (child.geometry) child.geometry.dispose();
    if (child.material) child.material.dispose();
  }
}

function makeLine(points, color) {
  const vertices = [];
  for (const point of points) vertices.push(point.x, point.y, point.z || 0);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
}

function fitCamera(toolpath) {
  const bounds = getBounds(collectPoints(toolpath.paths));
  if (!bounds) return;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const radius = Math.max(bounds.w, bounds.h, bounds.d, 20);
  three.controls.target.set(cx, cy, cz);
  three.camera.position.set(cx + radius * 1.25, cy - radius * 1.4, cz + radius * 1.1);
  three.camera.far = Math.max(5000, radius * 20);
  three.camera.updateProjectionMatrix();
}

function draw3D(inputShapes, toolpath) {
  clearGroup(three.shapeGroup);
  clearGroup(three.pathGroup);
  if (!toolpath) return;
  for (const path of inputShapes) {
    const points = path.points.map(point => ({ x: point.x, y: point.y, z: 0 }));
    if (path.closed && points.length) points.push({ ...points[0] });
    three.shapeGroup.add(makeLine(points, 0x2f7cb7));
  }
  const palette = [0xff5a5f, 0xff9248, 0xffc857, 0x8ce99a];
  let index = 0;
  for (const path of toolpath.paths) {
    const points = path.points.map(point => ({ x: point.x, y: point.y, z: point.z || 0 }));
    if (path.closed && points.length) points.push({ ...points[0] });
    three.pathGroup.add(makeLine(points, palette[index % palette.length]));
    index += 1;
  }
  fitCamera(toolpath);
}

function showInfo(toolpath) {
  if (!toolpath) {
    document.getElementById('infoContent').textContent = 'No toolpath generated yet';
    return;
  }
  let text = `Operation: ${toolpath.operationType}\n`;
  text += `Paths: ${toolpath.paths.length}\n`;
  text += `Total distance: ${toolpath.totalCutDistance.toFixed(2)}mm\n`;
  if (toolpath.bounds) {
    text += `Bounds X: ${toolpath.bounds.minX.toFixed(2)} to ${toolpath.bounds.maxX.toFixed(2)}\n`;
    text += `Bounds Y: ${toolpath.bounds.minY.toFixed(2)} to ${toolpath.bounds.maxY.toFixed(2)}\n`;
    text += `Bounds Z: ${toolpath.bounds.minZ.toFixed(2)} to ${toolpath.bounds.maxZ.toFixed(2)}\n`;
  }
  if (toolpath.metadata.levels) text += `Levels: ${toolpath.metadata.levels.map(level => level.toFixed(2)).join(', ')}\n`;
  text += `\nConfig:\n${JSON.stringify(toolpath.config, null, 2)}`;
  document.getElementById('infoContent').textContent = text;
}

function updateViewportInfo(toolpath) {
  if (!toolpath || !toolpath.bounds) {
    document.getElementById('viewportInfo').textContent = 'Select a shape and operation, then Generate';
    return;
  }
  document.getElementById('viewportInfo').textContent = `${toolpath.paths.length} paths | Z ${toolpath.bounds.minZ.toFixed(2)} to ${toolpath.bounds.maxZ.toFixed(2)}mm | Blue = source`;
}

function updateOperationUi(operationType) {
  document.getElementById('configPanel').innerHTML = configHtml(OP_CONFIG[operationType]);
  document.getElementById('codeContent').textContent = CODE_EXAMPLES[operationType] || '';
}

function generateToolpath() {
  const operationType = document.getElementById('operationSelect').value;
  const config = buildConfig();
  const shapes = getShapePaths();
  const geometry = toClipperGeometry(shapes);
  currentCamPaths = [];
  currentToolpath = null;
  currentGCode = '';

  let camPaths = [];
  let normalizedType = operationType;
  if (operationType === 'cut') {
    camPaths = engine.cut(geometry, [], config.direction === 'Climb');
    normalizedType = 'vector-cut';
  } else if (operationType === 'offsetInside') {
    const toolDiameter = (config.toolDiameter || 3.175) * clipper.mmToClipperScale;
    const cutWidth = (config.cutWidth || 3.175) * clipper.mmToClipperScale;
    if (config.margin) for (let i = 0; i < geometry.length; i++) geometry[i] = clipper.offset([geometry[i]], -config.margin * clipper.mmToClipperScale)[0];
    camPaths = engine.insideOutside(geometry, toolDiameter, true, cutWidth, config.stepOver || 40, config.direction === 'Climb', false);
    normalizedType = 'vector-inside';
  } else if (operationType === 'offsetOutside') {
    const toolDiameter = (config.toolDiameter || 3.175) * clipper.mmToClipperScale;
    const cutWidth = (config.cutWidth || 3.175) * clipper.mmToClipperScale;
    if (config.margin) for (let i = 0; i < geometry.length; i++) geometry[i] = clipper.offset([geometry[i]], config.margin * clipper.mmToClipperScale)[0];
    camPaths = engine.insideOutside(geometry, toolDiameter, false, cutWidth, config.stepOver || 40, config.direction === 'Climb', false);
    normalizedType = 'vector-outside';
  } else if (operationType === 'pocket') {
    if (config.margin) for (let i = 0; i < geometry.length; i++) geometry[i] = clipper.offset([geometry[i]], -config.margin * clipper.mmToClipperScale)[0];
    camPaths = engine.pocket(geometry, (config.toolDiameter || 3.175) * clipper.mmToClipperScale, config.stepOver || 40, config.direction === 'Climb');
    normalizedType = 'vector-pocket';
  } else if (operationType === 'raster' || operationType === 'laserFill') {
    camPaths = engine.fillPath(geometry, (config.lineDistance || 0.5) * clipper.mmToClipperScale, config.angle || 0);
    normalizedType = operationType === 'raster' ? 'vector-raster-fill' : 'laser-fill';
  } else if (operationType === 'laser') {
    camPaths = engine.cut(geometry, [], false);
    normalizedType = 'laser-vector';
  } else if (operationType === 'vcarve') {
    camPaths = vcarveOp.generate(shapes, {
      cutterAngle: config.cutterAngle || 60,
      passDepth: config.passDepth || 0.5
    });
    normalizedType = 'vector-vcarve';
  }
  if (camPaths.length) engine.reduceCamPaths(camPaths, (config.segmentLength || 0.1) * clipper.mmToClipperScale);
  currentCamPaths = camPaths;
  if (operationType === 'cut' || operationType === 'offsetInside' || operationType === 'offsetOutside' || operationType === 'pocket' || operationType === 'raster') {
    currentToolpath = applyDepthToCamPaths(camPaths, config, normalizedType);
  } else {
    currentToolpath = camPathsToToolpath(camPaths, normalizedType, config);
  }

  showInfo(currentToolpath);
  draw2D(shapes, currentToolpath);
  draw3D(shapes, currentToolpath);
  updateViewportInfo(currentToolpath);
  document.getElementById('gcodeContent').textContent = '';
}

function supportsFlatGCode(toolpath) {
  return toolpath && toolpath.bounds && Math.abs(toolpath.bounds.maxZ - toolpath.bounds.minZ) < 1e-9 && currentCamPaths.length > 0;
}

function generateGCode() {
  if (!supportsFlatGCode(currentToolpath)) {
    alert('Current G-code output only supports flat CAM paths in this demo');
    return;
  }
  const outputType = document.getElementById('outputType').value;
  const feedRate = parseFloat(document.getElementById('feedRate').value) || 800;
  const cfg = { type: outputType, feedRate, scale: 1 / clipper.mmToClipperScale, passes: 1 };
  if (outputType === 'laser') {
    cfg.laserPower = 50;
    cfg.separateTabs = path => [path];
  } else {
    cfg.zStart = 0;
    cfg.zEnd = -3;
    cfg.zClearance = 5;
    cfg.plungeRate = 200;
    cfg.passDepth = 0.5;
    cfg.spindleSpeed = 10000;
  }
  currentGCode = writer.write(currentCamPaths, cfg);
  document.getElementById('gcodeContent').textContent = currentGCode;
  switchTab('gcode');
}

function switchTab(name) {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(panel => panel.classList.toggle('active', panel.id === `${name}Panel`));
}

document.getElementById('operationSelect').addEventListener('change', () => updateOperationUi(document.getElementById('operationSelect').value));
document.getElementById('generateBtn').addEventListener('click', generateToolpath);
document.getElementById('gcodeBtn').addEventListener('click', generateGCode);
document.getElementById('copyBtn').addEventListener('click', () => { if (currentGCode) navigator.clipboard.writeText(currentGCode); });
document.getElementById('saveBtn').addEventListener('click', () => {
  if (!currentGCode) return;
  const blob = new Blob([currentGCode], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'toolpath.nc';
  link.click();
  URL.revokeObjectURL(url);
});
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.panel)));
window.addEventListener('resize', () => {
  resize2DCanvas();
  resizeThree();
  if (currentToolpath) {
    draw2D(getShapePaths(), currentToolpath);
    fitCamera(currentToolpath);
  }
});

updateOperationUi('cut');
initThree();
resize2DCanvas();
resizeThree();
animateThree();
document.getElementById('codeContent').textContent = CODE_EXAMPLES.cut;
