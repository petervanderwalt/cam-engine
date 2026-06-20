class AbstractGenerator {
  constructor(settings) { this.settings = settings; }
  postProcessRaster(gcode) {
    if (this.settings.gcodeToolOn && this.settings.gcodeToolOff) {
      gcode = gcode.replace(/G0([\s\S]*?)G1/gi, 'G0$1\n' + this.settings.gcodeToolOn + '\nG1');
      gcode = gcode.replace(/G1([\s\S]*?)G0/gi, 'G1$1\n' + this.settings.gcodeToolOff + '\nG0');
      return gcode;
    }
    return gcode;
  }
}

class DefaultGenerator extends AbstractGenerator {
  moveRapid(params) {
    if (params == null) return '';
    return 'G0 ' + this.move(params);
  }
  moveTool(params) {
    if (params == null) return '';
    return 'G1 ' + this.move(params);
  }
  toolOn(gcode, params) {
    if (gcode == null) return '';
    if (params && params.hasOwnProperty('i'))
      gcode = gcode.split('$INTENSITY').join(params.i);
    return gcode;
  }
  toolOff(gcode, params) {
    if (gcode == null) return '';
    if (params && params.hasOwnProperty('i'))
      gcode = gcode.split('$INTENSITY').join(params.i);
    return gcode;
  }
  move(params) {
    let gcode = '';
    if (params.hasOwnProperty('x')) gcode += ' X' + params.x;
    if (params.hasOwnProperty('y')) gcode += ' Y' + params.y;
    if (params.hasOwnProperty('a')) gcode += ' A' + params.a;
    if (params.hasOwnProperty('i')) gcode += ' ' + params.i;
    if (params.hasOwnProperty('s')) gcode += ' S' + params.s;
    if (params.hasOwnProperty('f')) gcode += ' F' + params.f;
    return gcode.trim();
  }
}

class MarlinGenerator extends AbstractGenerator {
  moveRapid(params) {
    if (params == null) return '';
    return this.move('G0', params);
  }
  moveTool(params) {
    if (params == null) return '';
    return this.move('G1', params);
  }
  toolOn(gcode, params) {
    if (gcode == null) return '';
    if (params && params.hasOwnProperty('i'))
      gcode = gcode.split('$INTENSITY').join(params.i);
    return gcode;
  }
  toolOff(gcode, params) {
    if (gcode == null) return '';
    if (params && params.hasOwnProperty('i'))
      gcode = gcode.split('$INTENSITY').join(params.i);
    return gcode;
  }
  move(prefix, params) {
    let gcode = '';
    if (params.hasOwnProperty('s')) {
      if (this.settings.gcodeToolOn.indexOf('$INTENSITY') > -1)
        gcode += this.settings.gcodeToolOn.split('$INTENSITY').join(this.settings.gcodeLaserIntensity + params.s) + '\r\n';
      else
        gcode += this.settings.gcodeToolOn + ' S' + params.s + '\r\n';
    }
    if (params.hasOwnProperty('i')) {
      if (this.settings.gcodeToolOn.indexOf('$INTENSITY') > -1)
        gcode += this.settings.gcodeToolOn.split('$INTENSITY').join(params.i) + '\r\n';
      else
        gcode += this.settings.gcodeToolOn + ' ' + params.i + '\r\n';
    }
    gcode += prefix;
    if (params.hasOwnProperty('x')) gcode += ' X' + params.x;
    if (params.hasOwnProperty('y')) gcode += ' Y' + params.y;
    if (params.hasOwnProperty('a')) gcode += ' A' + params.a;
    if (params.hasOwnProperty('f')) gcode += ' F' + params.f;
    return gcode.trim();
  }
}

export class GCodeWriter {
  constructor(flavor) {
    this.flavor = flavor || 'default';
  }

  getGenerator(settings) {
    const gen = this.flavor === 'marlin' ? MarlinGenerator : DefaultGenerator;
    return new gen(settings || {});
  }

  write(camPaths, config) {
    const gen = this.getGenerator(config);
    if (config.type === 'mill') {
      return this._writeMill(camPaths, config, gen);
    }
    return this._writeLaser(camPaths, config, gen);
  }

  _writeLaser(camPaths, config, gen) {
    const scale = config.scale || 1;
    const decimal = config.decimal || 2;
    const cutFeed = config.feedRate || 800;
    const laserPower = config.laserPower || 50;
    const passes = config.passes || 1;
    const gcodeToolOn = config.toolOn ? config.toolOn + '\r\n' : '';
    const gcodeToolOff = config.toolOff ? config.toolOff + '\r\n' : '';
    const gcodeLaserIntensity = config.laserIntensity || 'S';
    const gcodeSMinValue = config.sMinValue || 0;
    const gcodeSMaxValue = config.sMaxValue || 1000;
    const laserOnS = gcodeLaserIntensity + (gcodeSMinValue + (gcodeSMaxValue - gcodeSMinValue) * laserPower / 100).toFixed(decimal);

    let gcode = '';
    const separateTabs = config.separateTabs || (() => []);

    for (let pass = 0; pass < passes; ++pass) {
      gcode += '\n\n; Pass ' + pass + '\r\n';
      for (let pathIndex = 0; pathIndex < camPaths.length; ++pathIndex) {
        const path = camPaths[pathIndex].path;
        if (path.length === 0) continue;
        gcode += '\r\n; Pass ' + pass + ' Path ' + pathIndex + '\r\n';
        const separatedPaths = separateTabs(path, config.tabGeometry || []);
        for (let selIdx = 0; selIdx < separatedPaths.length; ++selIdx) {
          const selectedPath = separatedPaths[selIdx];
          if (selectedPath.length === 0) continue;
          if (selIdx & 1) { gcode += '; Skip tab\r\n'; continue; }
          gcode += gen.moveRapid(convertPoint(selectedPath[0], true, scale, decimal)) + '\r\n';
          gcode += gen.toolOn(gcodeToolOn, { i: laserOnS });
          for (let i = 1; i < selectedPath.length; ++i) {
            const action = convertPoint(selectedPath[i], false, scale, decimal);
            if (i === 1) action.f = cutFeed;
            gcode += gen.moveTool(action);
            gcode += '\r\n';
          }
          gcode += gen.toolOff(gcodeToolOff, { i: laserOnS });
        }
      }
    }
    return gcode;
  }

  _writeMill(camPaths, config, gen) {
    const scale = config.scale || 1;
    const decimal = config.decimal || 3;
    const topZ = config.zStart || 0;
    const botZ = config.zEnd || -1;
    const safeZ = config.zClearance || 5;
    const passDepth = config.passDepth || 0.5;
    const plungeFeed = config.plungeRate || 200;
    const cutFeed = config.feedRate || 800;
    const toolSpeed = config.spindleSpeed || 10000;
    const ramp = config.ramp || false;

    let gcode = '';
    let currentZ = safeZ;

    for (let pathIndex = 0; pathIndex < camPaths.length; ++pathIndex) {
      const camPath = camPaths[pathIndex];
      const origPath = camPath.path;
      if (origPath.length === 0) continue;

      gcode += '\r\n; Path ' + pathIndex + '\r\n';
      let finishedZ = topZ;
      while (finishedZ > botZ) {
        const nextZ = Math.max(finishedZ - passDepth, botZ);
        gcode += '; Rapid to initial position\r\n';
        gcode += 'G0' + convertMillPoint(origPath[0], null, scale) + '\r\n';
        gcode += 'G0 Z' + currentZ.toFixed(decimal) + '\r\n';

        gcode += '; plunge\r\n';
        gcode += 'G1 Z' + nextZ.toFixed(decimal) + ' F' + plungeFeed;
        if (toolSpeed) gcode += ' S' + toolSpeed;
        gcode += '\r\n';
        currentZ = nextZ;

        gcode += '; cut\r\n';
        for (let i = 1; i < origPath.length; ++i) {
          gcode += 'G1' + convertMillPoint(origPath[i], null, scale);
          if (i === 1) {
            gcode += ' F' + cutFeed;
            if (toolSpeed) gcode += ' S' + toolSpeed;
          }
          gcode += '\r\n';
        }
        finishedZ = nextZ;
      }
      gcode += '; Retract\r\nG0 Z' + safeZ.toFixed(decimal) + '\r\n';
      currentZ = safeZ;
    }
    return gcode;
  }
}

function convertPoint(p, rapid, scale, decimal) {
  return { x: (p.X * scale).toFixed(decimal), y: (p.Y * scale).toFixed(decimal) };
}

function convertMillPoint(p, useZ, scale) {
  let r = ' X' + (p.X * scale).toFixed(3) + ' Y' + (p.Y * scale).toFixed(3);
  return r;
}
