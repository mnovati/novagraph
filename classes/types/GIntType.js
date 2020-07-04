const GType = require('./GType.js');

class GIntType extends GType {

  constructor() {
    super();
  }

  async checkImpl(DB, viewer, value) {
    return typeof value === 'number' && isFinite(value) && Number.isInteger(value);
  }
}
module.exports = GIntType;
