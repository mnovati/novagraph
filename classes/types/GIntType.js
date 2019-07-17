const GType = require('./GType.js');

class GIntType extends GType {

  constructor() {
    super();
  }

  checkImpl(value) {
    return typeof value === 'number' && isFinite(value) && Number.isInteger(value);
  }
}
module.exports = GIntType;
