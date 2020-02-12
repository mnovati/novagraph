const GType = require('./GType.js');

class GFloatType extends GType {

  constructor() {
    super();
  }

  checkImpl(viewer, value) {
    var value = parseFloat(value);
    return typeof value === 'number' && isFinite(value);
  }
}
module.exports = GFloatType;
