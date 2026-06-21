import { Path } from '../types/Path.js';
import { Toolpath } from '../types/Toolpath.js';

export function serializeWorkerValue(value) {
  if (value instanceof Toolpath) {
    return {
      __camEngineType: 'Toolpath',
      value: value.toJSON()
    };
  }
  if (value instanceof Path) {
    return {
      __camEngineType: 'Path',
      value: {
        closed: value.closed,
        points: value.points.map(point => ({ ...point }))
      }
    };
  }
  if (Array.isArray(value)) {
    return value.map(item => serializeWorkerValue(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = serializeWorkerValue(item);
  }
  return result;
}

export function reviveWorkerValue(value) {
  if (Array.isArray(value)) {
    return value.map(item => reviveWorkerValue(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  if (value.__camEngineType === 'Toolpath') {
    return Toolpath.fromJSON(value.value);
  }
  if (value.__camEngineType === 'Path') {
    return new Path(
      (value.value?.points || []).map(point => ({ ...point })),
      !!value.value?.closed
    );
  }
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = reviveWorkerValue(item);
  }
  return result;
}

