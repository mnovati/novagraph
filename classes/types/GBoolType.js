const GType = require('./GType.js');

class GBoolType extends GType {

  constructor() {
    super();
  }

  checkImpl(value) {
    return value === true || value === false;
  }
}
module.exports = GBoolType;
