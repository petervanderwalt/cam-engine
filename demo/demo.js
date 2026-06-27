import * as THREE from 'https://esm.sh/three@0.160.0';
import { OrbitControls } from 'https://esm.sh/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import * as ClipperModule from 'https://cdn.jsdelivr.net/npm/js-clipper@1.0.1/+esm';
import { WorkerEngine, Path } from '../index.js';
import { GCodeWriter } from '../io/GCodeWriter.js';
import { ClipperAdapter } from '../adapters/ClipperAdapter.js';
import { STLReader } from '../io/STLReader.js';

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
let loadedImageData = null;
let loadedImageFile = null;
let loadedImageTexture = null;
let loadedImagePlane = null;
let loadedMesh = null;
let loadedMeshObject = null;
let loadedMeshOriginalVerts = null;
let currentCategory = 'vector';

const OPERATIONS_BY_CATEGORY = {
  vector: [
    { key: 'cut', label: 'Cut' },
    { key: 'offsetInside', label: 'Inside Offset' },
    { key: 'offsetOutside', label: 'Outside Offset' },
    { key: 'pocket', label: 'Pocket' },
    { key: 'concentric', label: 'Concentric' },
    { key: 'raster', label: 'Raster Fill' },
    { key: 'crosshatch', label: 'Crosshatch' },
    { key: 'vcarve', label: 'V-Carve' },
  ],
  dragKnife: [
    { key: 'dragKnife', label: 'Drag Knife' },
  ],
  laser: [
    { key: 'laser', label: 'Cut' },
    { key: 'laserInside', label: 'Inside Offset' },
    { key: 'laserOutside', label: 'Outside Offset' },
    { key: 'laserFill', label: 'Fill' },
    { key: 'laserCrosshatch', label: 'Crosshatch' },
    { key: 'laserConcentric', label: 'Concentric' },
  ],
  bitmap: [
    { key: 'bitmapRaster', label: 'Raster' },
    { key: 'bitmapHalftone', label: 'Halftone' },
    { key: 'bitmapWavy', label: 'Wavy' },
    { key: 'bitmapHeightmap', label: 'Heightmap' },
  ],
  mesh: [
    { key: 'meshWaterline', label: 'Waterline Roughing' },
    { key: 'meshRaster', label: 'Raster Roughing' },
    { key: 'meshRasterFinish', label: 'Raster Finishing' },
    { key: 'meshProfile', label: 'Profile' },
  ],
};

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

async function loadImageFile(file) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = URL.createObjectURL(file);
  });
  const cvs = document.createElement('canvas');
  cvs.width = img.width;
  cvs.height = img.height;
  const ctx = cvs.getContext('2d');
  ctx.drawImage(img, 0, 0);
  loadedImageData = ctx.getImageData(0, 0, img.width, img.height);
  loadedImageFile = file.name;
  drawBitmapPreview();
  return loadedImageData;
}

function readImageWidthMm() {
  const el = document.querySelector('#configPanel [data-key="imageWidthMm"]');
  return el ? parseFloat(el.value) || 50 : 50;
}

function resizeImagePlane(widthMm) {
  if (!loadedImageData || !loadedImagePlane) return;
  const cellSize = widthMm / loadedImageData.width;
  const w = widthMm;
  const h = loadedImageData.height * cellSize;
  loadedImagePlane.geometry.dispose();
  loadedImagePlane.geometry = new THREE.PlaneGeometry(w, h);
  loadedImagePlane.position.set(w / 2, h / 2, -0.01);
  fitToBounds({ minX: 0, minY: 0, maxX: w, maxY: h, w, h }, 1.1);
  three.renderer.render(three.scene, three.camera);
}

function drawBitmapPreview() {
  if (!loadedImageData) return;
  clearGroup(three.shapeGroup);
  clearGroup(three.pathGroup);
  if (loadedImagePlane) { three.scene.remove(loadedImagePlane); loadedImagePlane = null; }
  if (loadedImageTexture) { loadedImageTexture.dispose(); loadedImageTexture = null; }
  const widthMm = readImageWidthMm();
  const cellSize = widthMm / loadedImageData.width;
  const w = widthMm;
  const h = loadedImageData.height * cellSize;
  const cvs = document.createElement('canvas');
  cvs.width = loadedImageData.width;
  cvs.height = loadedImageData.height;
  cvs.getContext('2d').putImageData(loadedImageData, 0, 0);
  const dataUrl = cvs.toDataURL();
  const tex = new THREE.TextureLoader().load(dataUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  loadedImageTexture = tex;
  const geom = new THREE.PlaneGeometry(w, h);
  const mat = new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.position.set(w / 2, h / 2, -0.01);
  loadedImagePlane = mesh;
  three.scene.add(mesh);
  fitToBounds({ minX: 0, minY: 0, maxX: w, maxY: h, w, h }, 1.1);
  three.renderer.render(three.scene, three.camera);
  document.getElementById('viewportInfo').textContent = `${loadedImageFile} (${loadedImageData.width}x${loadedImageData.height})`;
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
  laserInside: { toolDiameter: { label: 'Tool dia (mm)', default: 3.175, step: 0.1 }, cutWidth: { label: 'Cut width (mm)', default: 3.175, step: 0.1 }, stepOver: { label: 'Stepover %', default: 40, step: 5 }, margin: { label: 'Margin (mm)', default: 0, step: 0.1 } },
  laserOutside: { toolDiameter: { label: 'Tool dia (mm)', default: 3.175, step: 0.1 }, cutWidth: { label: 'Cut width (mm)', default: 3.175, step: 0.1 }, stepOver: { label: 'Stepover %', default: 40, step: 5 }, margin: { label: 'Margin (mm)', default: 0, step: 0.1 } },
  laserFill: { lineDistance: { label: 'Line spacing (mm)', default: 0.5, step: 0.1 }, angle: { label: 'Angle (deg)', default: 0, step: 15 }, segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } },
  laserCrosshatch: { lineDistance: { label: 'Line spacing (mm)', default: 0.5, step: 0.1 }, angle: { label: 'Angle (deg)', default: 0, step: 15 } },
  laserConcentric: { toolDiameter: { label: 'Tool dia (mm)', default: 3.175, step: 0.1 }, stepOver: { label: 'Stepover %', default: 40, step: 5 } },
  concentric: withDepthFields({ toolDiameter: { label: 'Tool dia (mm)', default: 3.175, step: 0.1 }, stepOver: { label: 'Stepover %', default: 40, step: 5 }, margin: { label: 'Margin (mm)', default: 0, step: 0.1 }, segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } }, { zEnd: -3 }),
  crosshatch: withDepthFields({ lineDistance: { label: 'Line spacing (mm)', default: 0.5, step: 0.1 }, angle: { label: 'Angle (deg)', default: 0, step: 15 }, crossAngle: { label: 'Cross angle (deg)', default: 90, step: 15 }, segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } }, { zEnd: -1 }),
  dragKnife: { bladeOffset: { label: 'Drag offset (mm)', default: 1, step: 0.1 }, swivelToleranceDeg: { label: 'Swivel tolerance (deg)', default: 5, step: 1 }, swivelSegments: { label: 'Swivel segments', default: 12, step: 2 }, segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 } },
  vcarve: {
    cutterAngle: { label: 'Cutter angle (deg)', default: 60, step: 5 },
    maxDepth: { label: 'Max depth (mm)', default: 3, step: 0.1 },
    passDepth: { label: 'Pass depth (mm)', default: 0, step: 0.1 },
    segmentLength: { label: 'Segment (mm)', default: 0.1, step: 0.01 }
  },
  bitmapRaster: {
    scanAngle: { label: 'Scan angle (deg)', default: 0, step: 15 },
    scanSpacing: { label: 'Scan spacing (mm)', default: 0.2, step: 0.05 },
    imageWidthMm: { label: 'Image width (mm)', default: 50, step: 1 }
  },
  bitmapHalftone: {
    imageWidthMm: { label: 'Image width (mm)', default: 50, step: 1 },
    maxDepth: { label: 'Max depth (mm)', default: 3, step: 0.1 },
    dotSize: { label: 'Dot size (mm)', default: 0.5, step: 0.1 },
    dotSpacing: { label: 'Dot spacing (mm)', default: 1, step: 0.1 },
    invert: { label: 'Invert', type: 'checkbox', default: false }
  },
  bitmapWavy: {
    imageWidthMm: { label: 'Image width (mm)', default: 50, step: 1 },
    maxDepth: { label: 'Max depth (mm)', default: 3, step: 0.1 },
    direction: { label: 'Direction', type: 'select', default: 'top_to_bottom', options: ['top_to_bottom', 'bottom_to_top'] },
    invert: { label: 'Invert', type: 'checkbox', default: false }
  },
  bitmapHeightmap: {
    imageWidthMm: { label: 'Image width (mm)', default: 50, step: 1 },
    maxDepth: { label: 'Max depth (mm)', default: 3, step: 0.1 },
    stepOverPx: { label: 'Stepover (px)', default: 1, step: 1 },
    direction: { label: 'Direction', type: 'select', default: 'top_to_bottom', options: ['top_to_bottom', 'bottom_to_top'] },
    invert: { label: 'Invert', type: 'checkbox', default: false }
  },
  meshWaterline: {
    toolDiameter: { label: 'Tool dia (mm)', default: 3.175, step: 0.1 },
    stepover: { label: 'Stepover (mm)', default: 0.5, step: 0.1 },
    stepdown: { label: 'Stepdown (mm)', default: 1, step: 0.1 },
    stockToLeave: { label: 'Stock to leave (mm)', default: 0, step: 0.1 },
    angle: { label: 'Raster angle (deg)', default: 0, step: 15 },
    margin: { label: 'Margin (mm)', default: 0, step: 0.1 }
  },
  meshRaster: {
    toolDiameter: { label: 'Tool dia (mm)', default: 3.175, step: 0.1 },
    stepover: { label: 'Stepover (mm)', default: 0.5, step: 0.1 },
    stepdown: { label: 'Stepdown (mm)', default: 1, step: 0.1 },
    stockToLeave: { label: 'Stock to leave (mm)', default: 0, step: 0.1 },
    angle: { label: 'Raster angle (deg)', default: 0, step: 15 },
    margin: { label: 'Margin (mm)', default: 0, step: 0.1 }
  },
  meshRasterFinish: {
    toolDiameter: { label: 'Tool dia (mm)', default: 3.175, step: 0.1 },
    stepover: { label: 'Stepover (mm)', default: 0.5, step: 0.1 },
    direction: { label: 'Direction', type: 'select', default: 'x', options: ['x', 'y'] },
    stockToLeave: { label: 'Stock to leave (mm)', default: 0, step: 0.1 },
    margin: { label: 'Margin (mm)', default: 0, step: 0.1 }
  },
  meshProfile: {
    toolDiameter: { label: 'Tool dia (mm)', default: 3.175, step: 0.1 },
    stepover: { label: 'Stepover (mm)', default: 0.5, step: 0.1 },
    stepdown: { label: 'Stepdown (mm)', default: 1, step: 0.1 },
    stockToLeave: { label: 'Stock to leave (mm)', default: 0, step: 0.1 },
    direction: { label: 'Direction', type: 'select', default: 'Conventional', options: ['Conventional', 'Climb'] },
    margin: { label: 'Margin (mm)', default: 0, step: 0.1 },
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

function fitToBounds(bounds, padding) {
  if (!bounds) return;
  const rect = threeHost.getBoundingClientRect();
  const viewportAspect = rect.width / Math.max(rect.height, 1);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const bw = (bounds.w || 1) * padding;
  const bh = (bounds.h || 1) * padding;
  const halfH = Math.max(bh / 2, bw / 2 / viewportAspect, 10);
  const halfW = halfH * viewportAspect;
  three.controls.target.set(cx, cy, 0);
  three.camera.left = cx - halfW;
  three.camera.right = cx + halfW;
  three.camera.top = cy + halfH;
  three.camera.bottom = cy - halfH;
  three.camera.position.set(cx, cy, Math.max(bw, bh, 20) * 3);
  three.camera.far = Math.max(5000, Math.max(bw, bh, 20) * 20);
  three.camera.updateProjectionMatrix();
}

function resizeThree() {
  const rect = threeHost.getBoundingClientRect();
  const viewportAspect = rect.width / Math.max(rect.height, 1);
  const cx = (three.camera.right + three.camera.left) / 2;
  const cy = (three.camera.top + three.camera.bottom) / 2;
  const halfH = (three.camera.top - three.camera.bottom) / 2;
  three.camera.left = cx - halfH * viewportAspect;
  three.camera.right = cx + halfH * viewportAspect;
  three.camera.top = cy + halfH;
  three.camera.bottom = cy - halfH;
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
  three.shapeGroup.add(lines);
  const bounds = getBounds(paths.flatMap(p => p.points));
  if (bounds) fitToBounds(bounds, 1.2);
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
    } else if (field.type === 'checkbox') {
      html += `<input type="checkbox" data-key="${key}" ${field.default ? 'checked' : ''}>`;
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
  if (operationType === 'concentric') {
    return { operationId: 'vector-concentric', config };
  }
  if (operationType === 'crosshatch') {
    return { operationId: 'vector-crosshatch', config: { ...config, spacing: config.lineDistance || 0.5 } };
  }
  if (operationType === 'dragKnife') {
    return { operationId: 'drag-knife', config };
  }
  if (operationType === 'laserInside') {
    return { operationId: 'laser-inside', config };
  }
  if (operationType === 'laserOutside') {
    return { operationId: 'laser-outside', config };
  }
  if (operationType === 'laserCrosshatch') {
    return { operationId: 'laser-crosshatch', config };
  }
  if (operationType === 'laserConcentric') {
    return { operationId: 'laser-concentric', config };
  }
  if (operationType === 'meshWaterline') {
    return { operationId: 'mesh-waterline-roughing', config };
  }
  if (operationType === 'meshRaster') {
    return { operationId: 'mesh-raster-roughing', config };
  }
  if (operationType === 'meshRasterFinish') {
    return { operationId: 'mesh-raster-finishing', config };
  }
  if (operationType === 'meshProfile') {
    return { operationId: 'mesh-profile', config };
  }
  if (operationType === 'bitmapRaster') {
    return { operationId: 'bitmap-raster', config };
  }
  if (operationType === 'bitmapHalftone') {
    return { operationId: 'bitmap-halftone', config };
  }
  if (operationType === 'bitmapWavy') {
    return { operationId: 'bitmap-wavy', config };
  }
  if (operationType === 'bitmapHeightmap') {
    return { operationId: 'bitmap-heightmap', config };
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
  fitToBounds(bounds, 1.2);
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
    const labels = { vector: 'shape', bitmap: 'image', mesh: 'mesh' };
    document.getElementById('viewportInfo').textContent = `Select a ${labels[currentCategory] || 'shape'} and operation, then Generate`;
    return;
  }
  document.getElementById('viewportInfo').textContent = `${toolpath.paths.length} paths | Z ${toolpath.bounds.minZ.toFixed(2)} to ${toolpath.bounds.maxZ.toFixed(2)}mm | Blue = source`;
}

function populateOperationDropdown(category) {
  const ops = OPERATIONS_BY_CATEGORY[category];
  const sel = document.getElementById('operationSelect');
  sel.innerHTML = ops.map(o => `<option value="${o.key}">${o.label}</option>`).join('');
  updateOperationUi(sel.value);
}

function switchCategoryTab(category) {
  currentCategory = category;
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.toggle('active', t.dataset.cat === category));
  document.getElementById('vectorSource').style.display = category === 'vector' || category === 'laser' || category === 'dragKnife' ? '' : 'none';
  document.getElementById('bitmapSource').style.display = category === 'bitmap' ? '' : 'none';
  document.getElementById('meshSource').style.display = category === 'mesh' ? '' : 'none';
  document.getElementById('sourceTitle').textContent = category === 'mesh' ? '3D Model' : category === 'bitmap' ? 'Image' : 'Shape';
  clearGroup(three.shapeGroup);
  clearGroup(three.pathGroup);
  if (loadedImagePlane) { three.scene.remove(loadedImagePlane); loadedImagePlane = null; }
  if (loadedMeshObject) { three.scene.remove(loadedMeshObject); loadedMeshObject = null; }
  currentToolpath = null;
  currentGCode = '';
  document.getElementById('infoContent').textContent = 'No toolpath generated yet';
  document.getElementById('gcodeContent').textContent = '';
  populateOperationDropdown(category);
  if (category === 'vector' || category === 'laser' || category === 'dragKnife') {
    drawShapePreview(getShapePaths());
  } else if (category === 'bitmap' && loadedImageData) {
    drawBitmapPreview();
  } else if (category === 'mesh' && loadedMesh) {
    drawMeshPreview();
  }
}

function drawMeshPreview() {
  if (!loadedMesh) return;
  clearGroup(three.shapeGroup);
  clearGroup(three.pathGroup);
  if (loadedMeshObject) { three.scene.remove(loadedMeshObject); loadedMeshObject = null; }
  const verts = loadedMesh.vertices;
  const positions = [];
  const colors = [];
  for (let i = 0; i < verts.length; i += 3) {
    const v0 = verts[i], v1 = verts[i + 1], v2 = verts[i + 2];
    const ax = v1.x - v0.x, ay = v1.y - v0.y, az = v1.z - v0.z;
    const bx = v2.x - v0.x, by = v2.y - v0.y, bz = v2.z - v0.z;
    const nz = ax * by - ay * bx;
    const isOverhang = nz < 0;
    const col = isOverhang ? [1, 0.12, 0.12] : [0.27, 0.6, 1];
    for (const v of [v0, v1, v2]) {
      positions.push(v.x, v.y, v.z);
      colors.push(col[0], col[1], col[2]);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.MeshPhongMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geom, mat);
  loadedMeshObject = mesh;
  three.scene.add(mesh);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const v of loadedMesh.vertices) {
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
  }
  fitToBounds({ minX, maxX, minY, maxY, minZ, maxZ, w: maxX - minX || 1, h: maxY - minY || 1 }, 1.2);
  three.renderer.render(three.scene, three.camera);
  document.getElementById('viewportInfo').textContent = `Mesh: ${loadedMesh.triangles} triangles`;
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
    const isBitmap = currentCategory === 'bitmap';
    const isMesh = currentCategory === 'mesh';
    let source;
    if (isMesh && loadedMesh) {
      source = { type: 'mesh', mesh: loadedMesh };
    } else if (isBitmap && loadedImageData) {
      source = { type: 'bitmap', imageData: new ImageData(new Uint8ClampedArray(loadedImageData.data), loadedImageData.width, loadedImageData.height) };
    } else {
      source = { type: 'vector', paths: shapes };
    }
    if (isBitmap && !loadedImageData) {
      setBusy(false);
      document.getElementById('viewportInfo').textContent = 'Load an image first';
      return;
    }
    if (isMesh && !loadedMesh) {
      setBusy(false);
      document.getElementById('viewportInfo').textContent = 'Load a mesh (STL) first';
      return;
    }
    const job = await previewEngine.createToolpath({
      source,
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
    if (currentCategory === 'bitmap' && loadedImageData) resizeImagePlane(config.imageWidthMm || 50);
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
document.getElementById('imgFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await loadImageFile(file);
});
document.getElementById('loadImgBtn').addEventListener('click', () => {
  document.getElementById('imgFileInput').click();
});
document.getElementById('stlFileInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new STLReader();
  loadedMesh = await reader.readFromFile(file);
  loadedMeshOriginalVerts = loadedMesh.vertices.map(v => ({ x: v.x, y: v.y, z: v.z }));
  if (currentCategory === 'mesh') drawMeshPreview();
});
document.getElementById('loadStlBtn').addEventListener('click', () => {
  document.getElementById('stlFileInput').click();
});

function getMeshBounds() {
  if (!loadedMesh) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const v of loadedMesh.vertices) {
    if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
    if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
    if (v.z < minZ) minZ = v.z; if (v.z > maxZ) maxZ = v.z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ, w: maxX - minX || 1, h: maxY - minY || 1, d: maxZ - minZ || 1 };
}

function populateResizeModal() {
  const b = getMeshBounds();
  if (!b) return;
  document.getElementById('resizeW').value = b.w.toFixed(3);
  document.getElementById('resizeL').value = b.h.toFixed(3);
  document.getElementById('resizeH').value = b.d.toFixed(3);
}

function onResizeLinkedChange(changedId) {
  if (!document.getElementById('resizeLinked').checked) return;
  const b = getMeshBounds();
  if (!b) return;
  const w = parseFloat(document.getElementById('resizeW').value) || b.w;
  const l = parseFloat(document.getElementById('resizeL').value) || b.h;
  const h = parseFloat(document.getElementById('resizeH').value) || b.d;
  if (changedId === 'resizeW') {
    const r = w / b.w;
    document.getElementById('resizeL').value = (b.h * r).toFixed(3);
    document.getElementById('resizeH').value = (b.d * r).toFixed(3);
  } else if (changedId === 'resizeL') {
    const r = l / b.h;
    document.getElementById('resizeW').value = (b.w * r).toFixed(3);
    document.getElementById('resizeH').value = (b.d * r).toFixed(3);
  } else if (changedId === 'resizeH') {
    const r = h / b.d;
    document.getElementById('resizeW').value = (b.w * r).toFixed(3);
    document.getElementById('resizeL').value = (b.h * r).toFixed(3);
  }
}

function applyResize() {
  if (!loadedMesh || !loadedMeshOriginalVerts) return;
  const nw = parseFloat(document.getElementById('resizeW').value);
  const nl = parseFloat(document.getElementById('resizeL').value);
  const nh = parseFloat(document.getElementById('resizeH').value);
  if (!nw || !nl || !nh || nw <= 0 || nl <= 0 || nh <= 0) return;
  const b = getMeshBounds();
  const fx = nw / b.w, fy = nl / b.h, fz = nh / b.d;
  for (let i = 0; i < loadedMesh.vertices.length; i++) {
    loadedMesh.vertices[i].x = loadedMeshOriginalVerts[i].x * fx;
    loadedMesh.vertices[i].y = loadedMeshOriginalVerts[i].y * fy;
    loadedMesh.vertices[i].z = loadedMeshOriginalVerts[i].z * fz;
  }
  if (currentCategory === 'mesh') drawMeshPreview();
  closeResizeModal();
}

function openResizeModal() {
  if (!loadedMesh) { document.getElementById('viewportInfo').textContent = 'Load an STL first'; return; }
  populateResizeModal();
  document.getElementById('resizeModal').style.display = 'flex';
}

function closeResizeModal() {
  document.getElementById('resizeModal').style.display = 'none';
}

document.getElementById('resizeMeshBtn').addEventListener('click', openResizeModal);
document.getElementById('resizeCancel').addEventListener('click', closeResizeModal);
document.getElementById('resizeApply').addEventListener('click', applyResize);
document.getElementById('resizeW').addEventListener('input', () => onResizeLinkedChange('resizeW'));
document.getElementById('resizeL').addEventListener('input', () => onResizeLinkedChange('resizeL'));
document.getElementById('resizeH').addEventListener('input', () => onResizeLinkedChange('resizeH'));
document.getElementById('resizeModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeResizeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('resizeModal').style.display === 'flex') closeResizeModal();
});
document.querySelectorAll('.cat-tab').forEach(tab => tab.addEventListener('click', () => switchCategoryTab(tab.dataset.cat)));
document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.panel)));
window.addEventListener('resize', () => {
  resizeThree();
});
window.addEventListener('beforeunload', () => {
  previewEngine.terminate();
});

initThree();
resizeThree();
animateThree();
switchCategoryTab('vector');
loadBundledSvg().then(() => {
  document.getElementById('shapeSelect').value = 'camengineText';
  if (currentCategory === 'vector' || currentCategory === 'laser') drawShapePreview(loadedSvgPaths);
});
