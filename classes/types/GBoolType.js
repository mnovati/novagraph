const GType = require('./GType.js');

class GBoolType extends GType {

  constructor() {
    super();
  }

  async checkImpl(DB, viewer, value) {
    return value === true || value === false;
  }
}
module.exports = GBoolType;
