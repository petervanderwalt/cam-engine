export class OperationConfig {
  static SCHEMA = {
    vector: {
      offsetType: { type: 'select', options: ['none', 'inside', 'outside'],
        default: 'none', label: 'Offset type' },
      offsetDistance: { type: 'number', default: 0, label: 'Offset distance',
        unit: 'mm' },
      passes: { type: 'number', default: 1, min: 1, label: 'Passes' },
      direction: { type: 'select', options: ['climb', 'conventional'],
        default: 'climb', label: 'Direction' },
      zStart: { type: 'number', default: 0, label: 'Z start', unit: 'mm' },
      zDepth: { type: 'number', default: -1, label: 'Z depth', unit: 'mm' },
      zStep: { type: 'number', default: 0.5, label: 'Z step', unit: 'mm' },
      toolDiameter: { type: 'number', default: 3.175, label: 'Tool dia',
        unit: 'mm' },
      unionPaths: { type: 'boolean', default: false, label: 'Union paths' },
      tabs: { type: 'boolean', default: false, label: 'Add tabs' }
    },
    pocket: {
      toolDiameter: { type: 'number', default: 3.175, label: 'Tool dia',
        unit: 'mm' },
      stepover: { type: 'number', default: 0.4, min: 0.01, max: 1,
        label: 'Stepover', unit: '%' },
      zStart: { type: 'number', default: 0, label: 'Z start', unit: 'mm' },
      zDepth: { type: 'number', default: -2, label: 'Z depth', unit: 'mm' },
      zStep: { type: 'number', default: 0.5, label: 'Z step', unit: 'mm' },
      direction: { type: 'select', options: ['climb', 'conventional'],
        default: 'climb', label: 'Direction' },
      strategy: { type: 'select', options: ['concentric', 'raster'],
        default: 'concentric', label: 'Strategy' },
      rasterAngle: { type: 'number', default: 0, label: 'Raster angle',
        unit: 'deg', condition: (c) => c.strategy === 'raster' }
    },
    rasterFill: {
      angle: { type: 'number', default: 0, label: 'Fill angle', unit: 'deg' },
      spacing: { type: 'number', default: 0.2, label: 'Line spacing',
        unit: 'mm' },
      crossHatch: { type: 'boolean', default: false,
        label: 'Cross hatch' },
      crossAngle: { type: 'number', default: 90, label: 'Cross angle',
        unit: 'deg', condition: (c) => c.crossHatch },
      passes: { type: 'number', default: 1, min: 1, label: 'Passes' }
    },
    vcarve: {
      cutterAngle: { type: 'number', default: 90, label: 'Cutter angle',
        unit: 'deg', min: 10, max: 180 },
      tipDiameter: { type: 'number', default: 0.1, label: 'Tip diameter',
        unit: 'mm' },
      maxDepth: { type: 'number', default: 3, label: 'Max depth',
        unit: 'mm' },
      zStep: { type: 'number', default: 0.5, label: 'Z step', unit: 'mm' },
      flatAreaClear: { type: 'boolean', default: true,
        label: 'Clear flat areas' }
    },
    bitmapTrace: {
      threshold: { type: 'number', default: 128, min: 0, max: 255,
        label: 'Threshold' },
      turdSize: { type: 'number', default: 2, min: 0,
        label: 'Filter speckles' },
      alphaMax: { type: 'number', default: 1, min: 0, max: 1, step: 0.1,
        label: 'Corner rounding' },
      optCurve: { type: 'boolean', default: true, label: 'Optimize curves' }
    },
    bitmapRaster: {
      scanAngle: { type: 'number', default: 0, label: 'Scan angle', unit: 'deg' },
      scanSpacing: { type: 'number', default: 0.2, label: 'Scan spacing', unit: 'mm' },
      dpi: { type: 'number', default: 254, label: 'DPI' }
    },
    halftone: {
      dotSize: { type: 'number', default: 0.5, label: 'Min dot size',
        unit: 'mm' },
      dotSpacing: { type: 'number', default: 1, label: 'Dot spacing',
        unit: 'mm' },
      shape: { type: 'select', options: ['circle', 'diamond', 'line'],
        default: 'circle', label: 'Dot shape' },
      angle: { type: 'number', default: 45, label: 'Screen angle',
        unit: 'deg' },
      invert: { type: 'boolean', default: false, label: 'Invert' }
    },
    wavy: {
      amplitude: { type: 'number', default: 0.5, label: 'Amplitude',
        unit: 'mm' },
      wavelength: { type: 'number', default: 3, label: 'Wavelength',
        unit: 'mm' },
      angle: { type: 'number', default: 0, label: 'Wave angle',
        unit: 'deg' },
      spacing: { type: 'number', default: 0.3, label: 'Line spacing',
        unit: 'mm' },
      type: { type: 'select', options: ['sine', 'triangle', 'sawtooth'],
        default: 'sine', label: 'Wave type' }
    },
    heightmap: {
      maxDepth: { type: 'number', default: 3, label: 'Max depth',
        unit: 'mm' },
      toolDiameter: { type: 'number', default: 1, label: 'Tool dia',
        unit: 'mm' },
      stepover: { type: 'number', default: 0.3, label: 'Stepover' },
      strategy: { type: 'select', options: ['raster', 'spiral'],
        default: 'raster', label: 'Strategy' },
      zScale: { type: 'number', default: 1, label: 'Z scale' }
    },
    model3d: {
      toolDiameter: { type: 'number', default: 3.175, label: 'Tool dia',
        unit: 'mm' },
      stepover: { type: 'number', default: 0.3, label: 'Stepover' },
      zStep: { type: 'number', default: 0.5, label: 'Z step', unit: 'mm' },
      strategy: { type: 'select', options: ['raster', 'parallel'],
        default: 'raster', label: 'Finish strategy' },
      roughOffset: { type: 'number', default: 0.5, label: 'Rough offset',
        unit: 'mm' }
    },
    meshRoughing: {
      toolDiameter: { type: 'number', default: 3.175, label: 'Tool dia',
        unit: 'mm' },
      stepover: { type: 'number', default: 1, min: 0.05, label: 'Stepover',
        unit: 'mm' },
      stepdown: { type: 'number', default: 1, min: 0.05, label: 'Stepdown',
        unit: 'mm' },
      stockToLeave: { type: 'number', default: 0, label: 'Stock to leave',
        unit: 'mm' },
      angle: { type: 'number', default: 0, label: 'Raster angle',
        unit: 'deg' }
    },
    meshFinishing: {
      toolDiameter: { type: 'number', default: 3.175, label: 'Tool dia',
        unit: 'mm' },
      stepover: { type: 'number', default: 1, min: 0.05, label: 'Stepover',
        unit: 'mm' },
      direction: { type: 'select', options: ['x', 'y'],
        default: 'x', label: 'Direction' }
    },
    stepdown: {
      mode: { type: 'select', options: ['cut', 'inside', 'outside', 'pocket'],
        default: 'outside', label: 'Strategy' },
      toolDiameter: { type: 'number', default: 3.175, label: 'Tool dia',
        unit: 'mm' },
      cutWidth: { type: 'number', default: 3.175, label: 'Cut width',
        unit: 'mm' },
      stepOver: { type: 'number', default: 40, label: 'Stepover',
        unit: '%' },
      direction: { type: 'select', options: ['Conventional', 'Climb'],
        default: 'Climb', label: 'Direction' },
      zStart: { type: 'number', default: 0, label: 'Z start', unit: 'mm' },
      zEnd: { type: 'number', default: -3, label: 'Z end', unit: 'mm' },
      passDepth: { type: 'number', default: 0.5, label: 'Pass depth',
        unit: 'mm' },
      finishPassDepth: { type: 'number', default: 0, label: 'Finish pass',
        unit: 'mm' },
      springPasses: { type: 'number', default: 0, min: 0, label: 'Spring passes' },
      margin: { type: 'number', default: 0, label: 'Margin', unit: 'mm' },
      segmentLength: { type: 'number', default: 0.1, label: 'Segment',
        unit: 'mm' },
      tabs: { type: 'array', default: [], label: 'Tabs' },
      tabWidth: { type: 'number', default: 5, label: 'Tab width', unit: 'mm' },
      tabHeight: { type: 'number', default: 1, label: 'Tab height', unit: 'mm' },
      tabTolerance: { type: 'number', default: 0.75, label: 'Tab tolerance',
        unit: 'mm' }
    },
    meshProfile: {
      mode: { type: 'select', options: ['cut', 'inside', 'outside', 'pocket'],
        default: 'outside', label: 'Strategy' },
      toolDiameter: { type: 'number', default: 3.175, label: 'Tool dia',
        unit: 'mm' },
      cutWidth: { type: 'number', default: 3.175, label: 'Cut width',
        unit: 'mm' },
      stepOver: { type: 'number', default: 40, label: 'Stepover',
        unit: '%' },
      direction: { type: 'select', options: ['Conventional', 'Climb'],
        default: 'Climb', label: 'Direction' },
      zStart: { type: 'number', default: 0, label: 'Z start', unit: 'mm' },
      zEnd: { type: 'number', default: -3, label: 'Z end', unit: 'mm' },
      passDepth: { type: 'number', default: 0.5, label: 'Pass depth',
        unit: 'mm' },
      finishPassDepth: { type: 'number', default: 0, label: 'Finish pass',
        unit: 'mm' },
      springPasses: { type: 'number', default: 0, min: 0, label: 'Spring passes' },
      margin: { type: 'number', default: 0, label: 'Margin', unit: 'mm' },
      segmentLength: { type: 'number', default: 0.1, label: 'Segment',
        unit: 'mm' },
      tabs: { type: 'array', default: [], label: 'Tabs' },
      tabWidth: { type: 'number', default: 5, label: 'Tab width', unit: 'mm' },
      tabHeight: { type: 'number', default: 1, label: 'Tab height', unit: 'mm' },
      tabTolerance: { type: 'number', default: 0.75, label: 'Tab tolerance',
        unit: 'mm' }
    },
    laser: {
      power: { type: 'number', default: 50, min: 0, max: 100,
        label: 'Power', unit: '%' },
      speed: { type: 'number', default: 1000, label: 'Speed',
        unit: 'mm/min' },
      mode: { type: 'select', options: ['vector', 'raster', 'fill'],
        default: 'vector', label: 'Mode' },
      passes: { type: 'number', default: 1, min: 1, label: 'Passes' },
      dpi: { type: 'number', default: 254, label: 'DPI',
        condition: (c) => c.mode === 'raster' }
    },
    texture: {
      pattern: { type: 'select', options: ['linear', 'crosshatch',
        'peck', 'diamond', 'ripple', 'radial', 'stipple'],
        default: 'linear', label: 'Pattern' },
      spacing: { type: 'number', default: 1, label: 'Spacing', unit: 'mm' },
      amplitude: { type: 'number', default: 0.3, label: 'Amplitude',
        unit: 'mm' },
      angle: { type: 'number', default: 0, label: 'Angle', unit: 'deg' }
    },
    drill: {
      zStart: { type: 'number', default: 0, label: 'Z start', unit: 'mm' },
      zDepth: { type: 'number', default: -3, label: 'Z depth', unit: 'mm' },
      zStep: { type: 'number', default: 1, label: 'Peck step',
        unit: 'mm' },
      dwell: { type: 'number', default: 0, label: 'Dwell', unit: 's' },
      mode: { type: 'select', options: ['peck', 'continuous'],
        default: 'peck', label: 'Mode' }
    }
  };

  static getDefaults(type) {
    const schema = OperationConfig.SCHEMA[type];
    if (!schema) return {};
    const defaults = {};
    for (const [key, field] of Object.entries(schema)) {
      defaults[key] = field.default;
    }
    return defaults;
  }

  static validate(type, config) {
    const schema = OperationConfig.SCHEMA[type];
    if (!schema) return { valid: false, errors: [`Unknown type: ${type}`] };
    const errors = [];
    for (const [key, field] of Object.entries(schema)) {
      if (field.condition && !field.condition(config)) continue;
      const val = config[key];
      if (val === undefined || val === null) {
        if (field.required) errors.push(`Missing: ${key}`);
        continue;
      }
      if (field.min !== undefined && val < field.min)
        errors.push(`${key} min ${field.min}`);
      if (field.max !== undefined && val > field.max)
        errors.push(`${key} max ${field.max}`);
    }
    return { valid: errors.length === 0, errors };
  }

  static getTypes() {
    return Object.keys(OperationConfig.SCHEMA);
  }
}
