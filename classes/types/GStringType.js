const GType = require('./GType.js');

class GStringType extends GType {

  constructor() {
    super();
  }

  checkImpl(viewer, value) {
    return typeof value === 'string' || value instanceof String;
  }
}
module.exports = GStringType;
