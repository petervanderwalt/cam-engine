import { STLReader } from '../io/STLReader.js';
import { Path } from '../types/Path.js';
import { Toolpath } from '../types/Toolpath.js';
import { OperationConfig } from '../types/OperationConfig.js';
import { BitmapAdapter } from '../adapters/BitmapAdapter.js';
import { PotraceAdapter } from '../adapters/PotraceAdapter.js';
import { VectorOperation } from '../operations/VectorOperation.js';
import { PocketOperation } from '../operations/PocketOperation.js';
import { RasterFillOperation } from '../operations/RasterFillOperation.js';
import { LaserOperation } from '../operations/LaserOperation.js';
import { VCarveOperation } from '../operations/VCarveOperation.js';
import { LayeredStepdownOperation } from '../operations/LayeredStepdownOperation.js';
import { DragKnifeOperation } from '../operations/DragKnifeOperation.js';
import { HalftoneOperation } from '../operations/HalftoneOperation.js';
import { WavyOperation } from '../operations/WavyOperation.js';
import { HeightmapOperation } from '../operations/HeightmapOperation.js';
import { MeshWaterlineRoughingOperation } from '../operations/MeshWaterlineRoughingOperation.js';
import { MeshRasterRoughingOperation } from '../operations/MeshRasterRoughingOperation.js';
import { MeshRasterFinishingOperation } from '../operations/MeshRasterFinishingOperation.js';
import { MeshProfileOperation } from '../operations/MeshProfileOperation.js';

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config || {}));
}

function toToolpathFromCamPaths(camPaths, operationType, config, scale = 1 / 10000) {
  const toolpath = new Toolpath(operationType, cloneConfig(config));
  for (const camPath of camPaths || []) {
    const points = camPath.path.map(point => ({
      x: point.X * scale,
      y: point.Y * scale,
      z: (point.Z || 0) * scale
    }));
    toolpath.addPath(new Path(points, !!camPath.safeToClose), 0);
  }
  toolpath.computeBounds();
  return toolpath;
}

function normalizeDepthConfig(config = {}) {
  return {
    ...config,
    zStart: Number.isFinite(config.zStart) ? config.zStart : 0,
    zEnd: Number.isFinite(config.zEnd)
      ? config.zEnd
      : (Number.isFinite(config.zDepth) ? config.zDepth : 0),
    passDepth: Number.isFinite(config.passDepth)
      ? config.passDepth
      : (Number.isFinite(config.zStep) ? config.zStep : 0.5),
    finishPassDepth: Number.isFinite(config.finishPassDepth) ? config.finishPassDepth : 0,
    springPasses: Number.isFinite(config.springPasses) ? config.springPasses : 0
  };
}

function shouldApplyDepth(config = {}) {
  const depth = normalizeDepthConfig(config);
  return Math.abs(depth.zStart - depth.zEnd) > 1e-9;
}

function normalizeSource(source) {
  if (!source || typeof source !== 'object') {
    throw new Error('Source is required');
  }
  if (source.type) {
    return source;
  }
  if (source.geometry || source.paths) {
    return { ...source, type: 'vector' };
  }
  if (source.imageData) {
    return { ...source, type: 'bitmap' };
  }
  if (source.mesh || source.vertices || source.triangles) {
    return { ...source, type: 'mesh' };
  }
  throw new Error('Unable to infer source type');
}

export class OperationRegistry {
  constructor() {
    this.stlReader = new STLReader();
    this.bitmapAdapter = new BitmapAdapter();
    this.potrace = new PotraceAdapter();
    this.vectorOperation = new VectorOperation();
    this.pocketOperation = new PocketOperation();
    this.rasterFillOperation = new RasterFillOperation();
    this.laserOperation = new LaserOperation();
    this.vCarveOperation = new VCarveOperation();
    this.layeredStepdownOperation = new LayeredStepdownOperation();
    this.dragKnifeOperation = new DragKnifeOperation();
    this.halftoneOperation = new HalftoneOperation();
    this.wavyOperation = new WavyOperation();
    this.heightmapOperation = new HeightmapOperation();
    this.meshWaterlineRoughingOperation = new MeshWaterlineRoughingOperation();
    this.meshRasterRoughingOperation = new MeshRasterRoughingOperation();
    this.meshRasterFinishingOperation = new MeshRasterFinishingOperation();
    this.meshProfileOperation = new MeshProfileOperation();
    this.operations = this._buildOperations();
  }

  _buildOperations() {
    const vectorSource = source => source.geometry || source.paths || [];
    const openVectorSource = source => source.openGeometry || source.openPaths || [];
    const buildCrosshatch = (geometry, config, operationType) => {
      const primary = this.rasterFillOperation.generate(geometry, config);
      const secondary = this.rasterFillOperation.generate(geometry, {
        ...config,
        angle: (config.crossAngle ?? config.angle ?? 0) + 90
      });
      return toToolpathFromCamPaths(primary.concat(secondary), operationType, config);
    };
    const buildLaserCrosshatch = (source, config) => {
      const primary = this.laserOperation.generateVector(vectorSource(source), openVectorSource(source), {
        ...config,
        mode: 'fill'
      });
      const secondary = this.laserOperation.generateVector(vectorSource(source), openVectorSource(source), {
        ...config,
        mode: 'fill',
        lineAngle: (config.crossAngle ?? config.lineAngle ?? 0) + 90
      });
      return toToolpathFromCamPaths(primary.concat(secondary), 'laser-crosshatch', config);
    };
    const buildDepthAwareCamToolpath = (camPaths, config, operationType, metadata = {}) => {
      const depthConfig = normalizeDepthConfig(config);
      if (!shouldApplyDepth(depthConfig)) {
        const toolpath = toToolpathFromCamPaths(camPaths, operationType, config);
        toolpath.metadata = { ...toolpath.metadata, ...metadata };
        toolpath.computeBounds();
        return toolpath;
      }
      return this.layeredStepdownOperation.generateFromCamPaths(
        camPaths,
        depthConfig,
        operationType,
        metadata
      );
    };
    const toCamPathsFromToolpath = toolpath => toolpath.paths.map(path => ({
      path: path.points.map(point => ({
        X: Math.round(point.x * this.vectorOperation.clipper.mmToClipperScale),
        Y: Math.round(point.y * this.vectorOperation.clipper.mmToClipperScale),
        Z: 0
      })),
      safeToClose: !!path.closed
    }));
    const buildDepthAwarePathToolpath = (toolpath, config, operationType, metadata = {}) => {
      const depthConfig = normalizeDepthConfig(config);
      toolpath.operationType = operationType;
      if (!shouldApplyDepth(depthConfig)) {
        toolpath.metadata = { ...toolpath.metadata, ...metadata };
        toolpath.computeBounds();
        return toolpath;
      }
      return this.layeredStepdownOperation.generateFromCamPaths(
        toCamPathsFromToolpath(toolpath),
        depthConfig,
        operationType,
        { ...metadata, ...(toolpath.metadata || {}) }
      );
    };
    const vectorOperations = [
      {
        id: 'vector-cut',
        label: 'Vector Cut',
        sourceTypes: ['vector'],
        configType: 'vector',
        generate: ({ source, config }) =>
          buildDepthAwareCamToolpath(
            this.vectorOperation.generate(vectorSource(source), { ...config, mode: 'cut' }, openVectorSource(source)),
            config,
            'vector-cut',
            { inputType: 'vector', mode: 'cut' }
          )
      },
      {
        id: 'vector-inside',
        label: 'Vector Inside',
        sourceTypes: ['vector'],
        configType: 'vector',
        generate: ({ source, config }) =>
          buildDepthAwareCamToolpath(
            this.vectorOperation.generate(vectorSource(source), { ...config, mode: 'inside' }, openVectorSource(source)),
            config,
            'vector-inside',
            { inputType: 'vector', mode: 'inside' }
          )
      },
      {
        id: 'vector-outside',
        label: 'Vector Outside',
        sourceTypes: ['vector'],
        configType: 'vector',
        generate: ({ source, config }) =>
          buildDepthAwareCamToolpath(
            this.vectorOperation.generate(vectorSource(source), { ...config, mode: 'outside' }, openVectorSource(source)),
            config,
            'vector-outside',
            { inputType: 'vector', mode: 'outside' }
          )
      },
      {
        id: 'vector-pocket',
        label: 'Vector Pocket',
        sourceTypes: ['vector'],
        configType: 'pocket',
        generate: ({ source, config }) =>
          buildDepthAwareCamToolpath(
            this.pocketOperation.generate(vectorSource(source), { ...config, strategy: 'concentric' }),
            config,
            'vector-pocket',
            { inputType: 'vector', mode: 'pocket', strategy: 'concentric' }
          )
      },
      {
        id: 'vector-pocket-raster',
        label: 'Vector Raster Pocket',
        sourceTypes: ['vector'],
        configType: 'pocket',
        generate: ({ source, config }) =>
          buildDepthAwareCamToolpath(
            this.pocketOperation.generate(vectorSource(source), { ...config, strategy: 'raster' }),
            config,
            'vector-pocket-raster',
            { inputType: 'vector', mode: 'pocket', strategy: 'raster' }
          )
      },
      {
        id: 'vector-raster-fill',
        label: 'Vector Raster Fill',
        sourceTypes: ['vector'],
        configType: 'rasterFill',
        generate: ({ source, config }) =>
          buildDepthAwareCamToolpath(
            this.rasterFillOperation.generate(vectorSource(source), config),
            config,
            'vector-raster-fill',
            { inputType: 'vector', strategy: 'raster-fill' }
          )
      },
      {
        id: 'vector-crosshatch',
        label: 'Vector Crosshatch',
        sourceTypes: ['vector'],
        configType: 'rasterFill',
        generate: ({ source, config }) =>
          buildDepthAwareCamToolpath(
            toCamPathsFromToolpath(buildCrosshatch(vectorSource(source), config, 'vector-crosshatch')),
            config,
            'vector-crosshatch',
            { inputType: 'vector', strategy: 'crosshatch' }
          )
      },
      {
        id: 'vector-concentric',
        label: 'Vector Concentric',
        sourceTypes: ['vector'],
        configType: 'pocket',
        generate: ({ source, config }) =>
          buildDepthAwareCamToolpath(
            this.pocketOperation.generate(vectorSource(source), { ...config, mode: 'inside' }),
            config,
            'vector-concentric',
            { inputType: 'vector', mode: 'inside', strategy: 'concentric' }
          )
      },
      {
        id: 'vector-vcarve',
        label: 'Vector V-Carve',
        sourceTypes: ['vector'],
        configType: 'vcarve',
        generate: ({ source, config }) =>
          toToolpathFromCamPaths(
            this.vCarveOperation.generate(vectorSource(source), config),
            'vector-vcarve',
            config,
            1 / this.vCarveOperation.clipper.mmToClipperScale
          )
      },
      {
        id: 'drag-knife',
        label: 'Drag Knife',
        sourceTypes: ['vector'],
        configType: 'dragKnife',
        generate: ({ source, config }) =>
          buildDepthAwarePathToolpath(
            this.dragKnifeOperation.generate(vectorSource(source), config),
            {
              ...config,
              zStart: Number.isFinite(config.zStart) ? config.zStart : (Number.isFinite(config.z) ? config.z : 0),
              zEnd: Number.isFinite(config.zEnd) ? config.zEnd : (Number.isFinite(config.z) ? config.z : 0)
            },
            'drag-knife',
            { inputType: 'vector', strategy: 'drag-knife' }
          )
      }
    ];
    const laserOperations = [
      {
        id: 'laser-vector',
        label: 'Laser Vector',
        sourceTypes: ['vector'],
        configType: 'laser',
        generate: ({ source, config }) =>
          toToolpathFromCamPaths(
            this.laserOperation.generateVector(
              vectorSource(source),
              openVectorSource(source),
              { ...config, mode: 'cut' }
            ),
            'laser-vector',
            config
          )
      },
      {
        id: 'laser-inside',
        label: 'Laser Inside',
        sourceTypes: ['vector'],
        configType: 'laser',
        generate: ({ source, config }) =>
          toToolpathFromCamPaths(
            this.laserOperation.generateVector(
              vectorSource(source),
              openVectorSource(source),
              { ...config, mode: 'inside' }
            ),
            'laser-inside',
            config
          )
      },
      {
        id: 'laser-outside',
        label: 'Laser Outside',
        sourceTypes: ['vector'],
        configType: 'laser',
        generate: ({ source, config }) =>
          toToolpathFromCamPaths(
            this.laserOperation.generateVector(
              vectorSource(source),
              openVectorSource(source),
              { ...config, mode: 'outside' }
            ),
            'laser-outside',
            config
          )
      },
      {
        id: 'laser-fill',
        label: 'Laser Fill',
        sourceTypes: ['vector'],
        configType: 'laser',
        generate: ({ source, config }) =>
          toToolpathFromCamPaths(
            this.laserOperation.generateVector(
              vectorSource(source),
              openVectorSource(source),
              { ...config, mode: 'fill' }
            ),
            'laser-fill',
            config
          )
      },
      {
        id: 'laser-crosshatch',
        label: 'Laser Crosshatch',
        sourceTypes: ['vector'],
        configType: 'laser',
        generate: ({ source, config }) => buildLaserCrosshatch(source, config)
      },
      {
        id: 'laser-concentric',
        label: 'Laser Concentric',
        sourceTypes: ['vector'],
        configType: 'laser',
        generate: ({ source, config }) =>
          toToolpathFromCamPaths(
            this.laserOperation.generateVector(
              vectorSource(source),
              openVectorSource(source),
              { ...config, mode: 'inside' }
            ),
            'laser-concentric',
            config
          )
      }
    ];
    const bitmapOperations = [
      {
        id: 'bitmap-raster',
        label: 'Bitmap Raster',
        sourceTypes: ['bitmap'],
        configType: 'bitmapRaster',
        generate: ({ source, config }) => {
          const toolpath = new Toolpath('bitmap-raster', cloneConfig(config));
          const paths = this.bitmapAdapter.rasterToPaths(source.imageData, config);
          for (const path of paths) {
            toolpath.addPath(path, 0);
          }
          toolpath.metadata.inputType = 'bitmap';
          toolpath.computeBounds();
          return toolpath;
        }
      },
      {
        id: 'bitmap-halftone',
        label: 'Bitmap Halftone',
        sourceTypes: ['bitmap'],
        configType: 'halftone',
        generate: ({ source, config }) => this.halftoneOperation.generate(source.imageData, config)
      },
      {
        id: 'bitmap-wavy',
        label: 'Bitmap Wavy',
        sourceTypes: ['bitmap'],
        configType: 'wavy',
        generate: ({ source, config }) => this.wavyOperation.generate(source.imageData, config)
      },
      {
        id: 'bitmap-heightmap',
        label: 'Bitmap Heightmap',
        sourceTypes: ['bitmap'],
        configType: 'heightmap',
        generate: ({ source, config }) => this.heightmapOperation.generate(source.imageData, config)
      },
    ];
    const meshOperations = [
      {
        id: 'mesh-waterline-roughing',
        label: 'Mesh Waterline Roughing',
        sourceTypes: ['mesh'],
        configType: 'meshRoughing',
        generate: ({ source, config }) =>
          this.meshWaterlineRoughingOperation.generate(source.mesh || source, config)
      },
      {
        id: 'mesh-raster-roughing',
        label: 'Mesh Raster Roughing',
        sourceTypes: ['mesh'],
        configType: 'meshRoughing',
        generate: ({ source, config }) =>
          this.meshRasterRoughingOperation.generate(source.mesh || source, config)
      },
      {
        id: 'mesh-raster-finishing',
        label: 'Mesh Raster Finishing',
        sourceTypes: ['mesh'],
        configType: 'meshFinishing',
        generate: ({ source, config }) =>
          this.meshRasterFinishingOperation.generate(source.mesh || source, config)
      },
      {
        id: 'mesh-profile',
        label: 'Mesh Profile',
        sourceTypes: ['mesh'],
        configType: 'meshProfile',
        generate: ({ source, config }) =>
          this.meshProfileOperation.generate(source.mesh || source, config)
      },
      {
        id: 'mesh-finish',
        label: 'Mesh Finish',
        sourceTypes: ['mesh'],
        configType: 'meshFinishing',
        generate: ({ source, config }) =>
          this.meshRasterFinishingOperation.generate(source.mesh || source, config)
      }
    ];
    return vectorOperations.concat(laserOperations, bitmapOperations, meshOperations);
  }

  describeSource(input) {
    const source = normalizeSource(input);
    if (source.type === 'mesh' && source.format === 'stl' && source.buffer) {
      const mesh = this.stlReader.read(source.buffer);
      return {
        ...source,
        mesh,
        triangles: mesh.triangles,
        vertices: mesh.vertices.length
      };
    }
    return source;
  }

  traceBitmapToVectorSource(input, config = {}) {
    const source = this.describeSource(input);
    if (source.type !== 'bitmap') {
      throw new Error(`Bitmap tracing requires a bitmap source, received ${source.type}`);
    }
    const traceConfig = {
      ...OperationConfig.getDefaults('bitmapTrace'),
      ...cloneConfig(config)
    };
    const paths = this.potrace.trace(source.imageData, {
      threshold: traceConfig.threshold,
      turdSize: traceConfig.turdSize,
      alphaMax: traceConfig.alphaMax,
      optCurve: traceConfig.optCurve
    });
    return {
      type: 'vector',
      paths: paths.map(path => path.clone ? path.clone() : new Path(path.points || [], !!path.closed)),
      sourceType: 'bitmap',
      traceConfig
    };
  }

  listSourceTypes() {
    return ['vector', 'bitmap', 'mesh'];
  }

  listSupportedFormats() {
    return {
      vector: ['svg', 'dxf', 'gerber', 'polyline', 'geometry'],
      bitmap: ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'imageData'],
      mesh: ['stl', 'obj', '3mf', 'mesh']
    };
  }

  listOperations(filters = {}) {
    const { sourceType } = filters;
    return this.operations
      .filter(operation => !sourceType || operation.sourceTypes.includes(sourceType))
      .map(operation => ({
        id: operation.id,
        label: operation.label,
        sourceTypes: operation.sourceTypes.slice(),
        configType: operation.configType,
        defaults: this.getDefaultConfig(operation.id)
      }));
  }

  getOperation(operationId) {
    const operation = this.operations.find(item => item.id === operationId);
    if (!operation) {
      throw new Error(`Unknown operation: ${operationId}`);
    }
    return operation;
  }

  getDefaultConfig(operationId) {
    const operation = this.getOperation(operationId);
    return OperationConfig.getDefaults(operation.configType);
  }

  generate(operationId, input, config = {}) {
    const operation = this.getOperation(operationId);
    const source = this.describeSource(input);
    if (!operation.sourceTypes.includes(source.type)) {
      throw new Error(`Operation ${operationId} does not support source type ${source.type}`);
    }
    const mergedConfig = { ...this.getDefaultConfig(operationId), ...cloneConfig(config) };
    return operation.generate({ source, config: mergedConfig });
  }
}
