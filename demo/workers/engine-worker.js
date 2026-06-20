let engine = null;

async function ensureEngine() {
  if (!engine) {
    const { Engine } = await import('../index.js');
    engine = new Engine();
  }
  return engine;
}

function inflatePaths(data) {
  if (!data) return [];
  return data.map(p => ({
    points: p.points || p,
    closed: p.closed !== undefined ? p.closed : true
  }));
}

self.onmessage = async function(e) {
  const { id, type, payload } = e.data;
  try {
    const eng = await ensureEngine();
    let result;
    switch (type) {
      case 'generate': {
        const { operationType, inputData, config } = payload;
        if (inputData.paths) {
          eng.loadPaths(inflatePaths(inputData.paths));
        }
        if (inputData.imageData) {
          eng.loadImageData(inputData.imageData);
        }
        if (inputData.mesh) {
          eng.loadMesh(inputData.mesh);
        }
        result = await eng.generate(operationType, config);
        break;
      }
      case 'gcode': {
        const { toolpathData, gcodeConfig } = payload;
        const tp = eng.toolpaths.find(t => t.operationType === toolpathData.type);
        if (!tp) throw new Error('Toolpath not found');
        result = eng.generateGCode(tp, gcodeConfig);
        break;
      }
      case 'loadSTL': {
        const { buffer } = payload;
        const { STLReader } = await import('../io/STLReader.js');
        const reader = new STLReader();
        result = reader.read(buffer);
        break;
      }
      default:
        throw new Error('Unknown message type: ' + type);
    }
    self.postMessage({ id, result: result.toJSON ? result.toJSON() : result });
  } catch (err) {
    self.postMessage({ id, error: err.message });
  }
};
