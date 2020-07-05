const GType = require('./GType.js');

class GBoolType extends GType {

  constructor() {
    super();
  }

  async checkImpl(viewer, value) {
    return value === true || value === false;
  }
}
module.exports = GBoolType;
