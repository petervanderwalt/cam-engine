import { OperationRegistry } from './OperationRegistry.js';

export class UniversalEngine {
  constructor() {
    this.registry = new OperationRegistry();
  }

  describeCapabilities() {
    return {
      sourceTypes: this.registry.listSourceTypes(),
      formats: this.registry.listSupportedFormats(),
      operations: this.registry.listOperations()
    };
  }

  describeSource(source) {
    return this.registry.describeSource(source);
  }

  traceBitmapToVectorSource(source, config = {}) {
    return this.registry.traceBitmapToVectorSource(source, config);
  }

  listOperations(filters = {}) {
    return this.registry.listOperations(filters);
  }

  getDefaultConfig(operationId) {
    return this.registry.getDefaultConfig(operationId);
  }

  createToolpath({ source, operationId, config = {} }) {
    const result = this.registry.generate(operationId, source, config);
    return {
      operationId,
      sourceType: this.registry.describeSource(source).type,
      result
    };
  }
}
