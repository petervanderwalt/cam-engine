import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import * as ClipperModule from 'https://cdn.jsdelivr.net/npm/js-clipper@1.0.1/+esm';
import { WorkerEngine, Path } from '../index.js';
import { GCodeWriter } from '../io/GCodeWriter.js';
import { ClipperAdapter } from '../adapters/ClipperAdapter.js';

globalThis.ClipperLib = ClipperModule.default || ClipperModule.ClipperLib || ClipperModule;

const DEMO_ASSET_VERSION = '2026-06-22-svg-paths';
const CAM_CPP_VARIANT = 'debug';

const previewEngine = new WorkerEngine({
  workerUrl: new URL(`../workers/universal-engine.worker.js?v=${DEMO_ASSET_VERSION}&camCpp=${CAM_CPP_VARIANT}`, import.meta.url)
});
const clipper = new ClipperAdapter();
const writer = new GCodeWriter();
const threeHost = document.getElementById('threeViewport');
const generateButton = document.getElementById('generateBtn');
let activeDebugTimer = null;

let currentCamPaths = [];
let currentToolpath = null;
let currentGCode = '';

let loadedSvgPaths = null;
let loadedSvgName = null;

function parseSvgPaths(svgText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgText, 'image/svg+xml');
  const ns = 'http://www.w3.org/2000/svg';
  const tempSvg = document.createElementNS(ns, 'svg');
  const viewBox = (doc.documentElement.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  if (viewBox.length === 4) tempSvg.setAttribute('viewBox', viewBox.join(' '));
  const result = [];
  const step = 0.5;
  for (const el of doc.querySelectorAll('path')) {
    const d = el.getAttribute('d');
    if (!d) continue;
    const pathEl = document.createElementNS(ns, 'path');
    pathEl.setAttribute('d', d);
    tempSvg.appendChild(pathEl);
    const length = pathEl.getTotalLength();
    if (length <= 0) { tempSvg.removeChild(pathEl); continue; }
    const pts = [];
    for (let t = 0; t <= length; t += step) {
      const p = pathEl.getPointAtLength(t);
      pts.push({ x: p.x, y: -p.y, z: 0 });
    }
    tempSvg.removeChild(pathEl);
    const end = pathEl.getPointAtLength(length);
    const last = pts[pts.length - 1];
    if (Math.hypot(end.x - last.x, end.y - (-end.y)) > 0.01) pts.push({ x: end.x, y: -end.y, z: 0 });
    const subPaths = [];
    let start = 0;
    const jump = step * 5;
    for (let i = 1; i < pts.length; i++) {
      if (Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) > jump) {
        if (i - start > 1) subPaths.push({ pts: pts.slice(start, i), closed: true });
        start = i;
      }
    }
    if (pts.length - start > 1) subPaths.push({ pts: pts.slice(start), closed: true });
    for (const sp of subPaths) result.push(new Path(sp.pts, sp.closed));
  }
  return result;
}

function centerAndScalePaths(paths, targetSize = 100) {
  const allPoints = paths.flatMap(p => p.points);
  if (!allPoints.length) return paths;
  const b = getBounds(allPoints);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const scale = targetSize / Math.max(b.w, b.h, 1);
  for (const path of paths)
    for (const pt of path.points) { pt.x = (pt.x - cx) * scale; pt.y = (pt.y - cy) * scale; }
  return paths;
}

async function loadBundledSvg() {
  const url = new URL('camengine-text-shape.svg', import.meta.url);
  const res = await fetch(url);
  loadedSvgName = 'CAMEngine Text';
  loadedSvgPaths = centerAndScalePaths(parseSvgPaths(await res.text()));
  return loadedSvgPaths;
}

async function loadSvgFromFile(file) {
  loadedSvgName = file.name;
  loadedSvgPaths = centerAndScalePaths(parseSvgPaths(await file.text()));
  return loadedSvgPaths;
}

const SHAPES = {
  square: () => [new Path([{ x: -25, y: -25, z: 0 }, { x: 25, y: -25, z: 0 }, { x: 25, y: 25, z: 0 }, { x: -25, y: 25, z: 0 }], true)],
  circle: () => { const pts = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; pts.push({ x: 25 * Math.cos(a), y: 25 * Math.sin(a), z: 0 }); } return [new Path(pts, true)]; },
  star: () => { const pts = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2; const r = i % 2 === 0 ? 25 : 10; pts.push({ x: r * Math.cos(a), y: r * Math.sin(a), z: 0 }); } return [new Path(pts, true)]; },
  rectangle: () => [new Path([{ x: -40, y: -20, z: 0 }, { x: 40, y: -20, z: 0 }, { x: 40, y: 20, z: 0 }, { x: -40, y: 20, z: 0 }], true)],
  ring: () => { const outer = []; const inner = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; outer.push({ x: 25 * Math.cos(a), y: 25 * Math.sin(a), z: 0 }); inner.push({ x: 12 * Math.cos(-a), y: 12 * Math.sin(-a), z: 0 }); } return [new Path(outer, true), new Path(inner, true)]; },
  cross: () => [new Path([{ x: -5, y: -25, z: 0 }, { x: 5, y: -25, z: 0 }, { x: 5, y: -5, z: 0 }, { x: 25, y: -5, z: 0 }, { x: 25, y: 5, z: 0 }, { x: 5, y: 5, z: 0 }, { x: 5, y: 25, z: 0 }, { x: -5, y: 25, z: 0 }, { x: -5, y: 5, z: 0 }, { x: -25, y: 5, z: 0 }, { x: -25, y: -5, z: 0 }, { x: -5, y: -5, z: 0 }], true)],
  camengineText: () => loadedSvgPaths ? loadedSvgPaths.map(p => new Path(p.points.map(pt => ({ x: pt.x, y: pt.y, z: 0 })), p.closed)) : []
};

const CODE_EXAMPLES = {
  cut: `import { WorkerEngine } from 'cam-engine';

const engine = new WorkerEngine();
await engine.init();

const job = await engine.createToolpath({
  source: { type: 'vector', paths },
  operationId: 'vector-cut',
  config: {
  zStart: 0,
  zEnd: -3,
  passDepth: 0.5
  }
});`,
  offsetInside: `import { WorkerEngine } from 'cam-engine';

const engine = new WorkerEngine();
await engine.init();

const job = await engine.createToolpath({
  source: { type: 'vector', paths },
  operationId: 'vector-inside',
  config
});`,
  offsetOutside: `import { WorkerEngine } from 'cam-engine';

const engine = new WorkerEngine();
await engine.init();

const job = await engine.createToolpath({
  source: { type: 'vector', paths },
  operationId: 'vector-outside',
  config
});`,
  pocket: `import { WorkerEngine } from 'cam-engine';

const engine = new WorkerEngine();
await engine.init();

const job = await engine.createToolpath({
  source: { type: 'vector', paths },
  operationId: 'vector-pocket',
  config
});`,
  raster: `import { WorkerEngine } from 'cam-engine';

const engine = new WorkerEngine();
await engine.init();

const job = await engine.createToolpath({
  source: { type: 'vector', paths },
  operationId: 'vector-raster-fill',
  config: { ...config, spacing: config.lineDistance }
});`,
  laser: `import { WorkerEngine } from 'cam-engine';

const engine = new WorkerEngine();
await engine.init();

const job = await engine.createToolpath({
  source: { type: 'vector', paths },
  operationId: 'laser-vector',
  config
});`,
  laserFill: `import { WorkerEngine } from 'cam-engine';

const engine = new WorkerEngine();
await engine.init();

const job = await engine.createToolpath({
  source: { type: 'vector', paths },
  operationId: 'laser-fill',
  config
});`,
  vcarve: `import { WorkerEngine } from 'cam-engine';

const engine = new WorkerEngine();
await engine.init();

const job = await engine.createToolpath({
  source: { type: 'vector', paths },
  operationId: 'vector-vcarve',
  config
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
  vcarve: {
    cutterAngle: { label: 'Cutter angle (deg)', default: 60, step: 5 },
    maxDepth: { label: 'Max depth (mm)', default: 3, step: 0.1 },
    passDepth: { label: 'Pass depth (mm)', default: 0, step: 0.1 },
    segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 }
  }
};

const three = { renderer: null, scene: null, camera: null, controls: null, pathGroup: null, shapeGroup: null };

function initThree() {
  three.renderer = new THREE.WebGLRenderer({ antialias: true });
  three.renderer.setPixelRatio(window.devicePixelRatio || 1);
  three.renderer.setClearColor(0x0d0d1a, 1);
  threeHost.appendChild(three.renderer.domElement);
  three.scene = new THREE.Scene();
  const rect = threeHost.getBoundingClientRect();
  const aspect = rect.width / Math.max(rect.height, 1);
  three.camera = new THREE.OrthographicCamera(-60 * aspect, 60 * aspect, 60, -60, 0.1, 5000);
  three.camera.position.set(0, 0, 200);
  three.controls = new OrbitControls(three.camera, three.renderer.domElement);
  three.controls.enableDamping = true;
  three.controls.target.set(0, 0, 0);
  three.scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const light = new THREE.DirectionalLight(0xffffff, 0.8);
  light.position.set(0, 0, 200);
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

function resizeThree() {
  const rect = threeHost.getBoundingClientRect();
  three.camera.aspect = rect.width / Math.max(rect.height, 1);
  three.camera.updateProjectionMatrix();
  three.renderer.setSize(rect.width, rect.height, false);
}

function getShapePaths() {
  const key = document.getElementById('shapeSelect').value;
  if (key === 'camengineText' && loadedSvgPaths) {
    return loadedSvgPaths.map(p => new Path(p.points.map(pt => ({ x: pt.x, y: pt.y, z: 0 })), p.closed));
  }
  return SHAPES[key]();
}

function drawShapePreview(paths) {
  clearGroup(three.shapeGroup);
  clearGroup(three.pathGroup);
  const color = 0x4488ff;
  const positions = [];
  for (const path of paths) {
    for (let i = 0; i < path.points.length; i++) {
      const a = path.points[i];
      const b = path.points[(i + 1) % path.points.length];
      if (!path.closed && i === path.points.length - 1) break;
      positions.push(a.x, a.y, 0, b.x, b.y, 0);
    }
  }
  if (!positions.length) return;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color, depthTest: false });
  const lines = new THREE.LineSegments(geom, mat);
  three.scene.add(lines);
  const bounds = getBounds(paths.flatMap(p => p.points));
  if (bounds) {
    const cx = (bounds.minX + bounds.maxX) / 2;
    const cy = (bounds.minY + bounds.maxY) / 2;
    const radius = Math.max(bounds.w, bounds.h, 20);
    const aspect = three.camera.right / three.camera.top;
    three.controls.target.set(cx, cy, 0);
    three.camera.left = -radius * aspect;
    three.camera.right = radius * aspect;
    three.camera.top = radius;
    three.camera.bottom = -radius;
    three.camera.position.set(cx, cy, radius * 5);
    three.camera.far = Math.max(5000, radius * 20);
    three.camera.updateProjectionMatrix();
  }
  three.renderer.render(three.scene, three.camera);
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

function toolpathToCamPaths(toolpath) {
  return toolpath.paths.map(path => ({
    path: path.points.map(point => ({
      X: point.x * clipper.mmToClipperScale,
      Y: point.y * clipper.mmToClipperScale,
      Z: (point.z || 0) * clipper.mmToClipperScale
    })),
    safeToClose: !!path.closed
  }));
}

function mapDemoOperation(operationType, config) {
  if (operationType === 'cut') {
    return { operationId: 'vector-cut', config };
  }
  if (operationType === 'offsetInside') {
    return { operationId: 'vector-inside', config };
  }
  if (operationType === 'offsetOutside') {
    return { operationId: 'vector-outside', config };
  }
  if (operationType === 'pocket') {
    return { operationId: 'vector-pocket', config };
  }
  if (operationType === 'raster') {
    return { operationId: 'vector-raster-fill', config: { ...config, spacing: config.lineDistance || 0.5 } };
  }
  if (operationType === 'laser') {
    return { operationId: 'laser-vector', config };
  }
  if (operationType === 'laserFill') {
    return { operationId: 'laser-fill', config: { ...config, lineDistance: config.lineDistance || 0.5 } };
  }
  if (operationType === 'vcarve') {
    return { operationId: 'vector-vcarve', config };
  }
  throw new Error(`Unsupported demo operation: ${operationType}`);
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
  for (const path of paths) {
    if (!path?.points?.length) continue;
    for (const point of path.points) points.push(point);
  }
  return points;
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
  const aspect = three.camera.right / three.camera.top;
  three.controls.target.set(cx, cy, cz);
  three.camera.left = -radius * aspect;
  three.camera.right = radius * aspect;
  three.camera.top = radius;
  three.camera.bottom = -radius;
  three.camera.position.set(cx, cy, radius * 5);
  three.camera.far = Math.max(5000, radius * 20);
  three.camera.updateProjectionMatrix();
}

function draw3D(toolpath, shapes) {
  clearGroup(three.pathGroup);
  if (!toolpath) return;
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

function setBusy(isBusy, message = '') {
  generateButton.disabled = isBusy;
  generateButton.textContent = isBusy ? 'Generating...' : 'Generate toolpath';
  if (message) {
    document.getElementById('viewportInfo').textContent = message;
  }
}

async function generateToolpath() {
  const operationType = document.getElementById('operationSelect').value;
  const config = buildConfig();
  const shapes = getShapePaths();
  const startedAt = performance.now();
  console.log('[demo] generateToolpath start', {
    operationType,
    shape: document.getElementById('shapeSelect').value,
    config,
    pathCount: shapes.length
  });
  currentCamPaths = [];
  currentToolpath = null;
  currentGCode = '';
  setBusy(true, 'Generating toolpath in worker...');
  clearTimeout(activeDebugTimer);
  activeDebugTimer = setTimeout(() => {
    console.warn('[demo] toolpath request still pending after 5s', {
      operationType,
      config
    });
  }, 5000);
  try {
    const mapped = mapDemoOperation(operationType, config);
    console.log('[demo] mapped operation', mapped);
    const job = await previewEngine.createToolpath({
      source: { type: 'vector', paths: shapes },
      operationId: mapped.operationId,
      config: mapped.config
    });
    console.log('[demo] worker job resolved', {
      operationType: job.result?.operationType,
      ms: Math.round(performance.now() - startedAt),
      pathCount: job.result?.paths?.length
    });
    currentToolpath = job.result;
    if (currentToolpath && currentToolpath.bounds && Math.abs(currentToolpath.bounds.maxZ - currentToolpath.bounds.minZ) < 1e-9) {
      currentCamPaths = toolpathToCamPaths(currentToolpath);
    }
    showInfo(currentToolpath);
    draw3D(currentToolpath, shapes);
    updateViewportInfo(currentToolpath);
    document.getElementById('gcodeContent').textContent = '';
  } catch (error) {
    console.error('[demo] worker job failed', error);
    document.getElementById('infoContent').textContent = error.message;
    document.getElementById('viewportInfo').textContent = `Toolpath generation failed: ${error.message}`;
  } finally {
    clearTimeout(activeDebugTimer);
    setBusy(false);
    console.log('[demo] generateToolpath end', {
      ms: Math.round(performance.now() - startedAt)
    });
  }
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
document.getElementById('shapeSelect').addEventListener('change', () => {
  if (document.getElementById('shapeSelect').value === 'camengineText' && loadedSvgPaths) {
    drawShapePreview(loadedSvgPaths);
  } else {
    drawShapePreview(getShapePaths());
  }
});
document.getElementById('svgFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await loadSvgFromFile(file);
  document.getElementById('shapeSelect').value = 'camengineText';
  drawShapePreview(loadedSvgPaths);
});
document.getElementById('loadSvgBtn').addEventListener('click', () => {
  document.getElementById('svgFileInput').click();
});
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.panel)));
window.addEventListener('resize', () => {
  resizeThree();
  if (currentToolpath) {
    fitCamera(currentToolpath);
  }
});
window.addEventListener('beforeunload', () => {
  previewEngine.terminate();
});

updateOperationUi('cut');
initThree();
resizeThree();
animateThree();
document.getElementById('codeContent').textContent = CODE_EXAMPLES.cut;
loadBundledSvg().then(() => {
  document.getElementById('shapeSelect').value = 'camengineText';
  drawShapePreview(loadedSvgPaths);
});
