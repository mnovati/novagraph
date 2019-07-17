const GType = require('./GType.js');

class GArrayType extends GType {

  constructor(type) {
    super();
    this.type = type;
  }

  checkImpl(value) {
    if (!Array.isArray(value)) {
      return false;
    }
    for (var ii = 0; ii < value.length; ii++) {
      if (!this.type.check(value[ii])) {
        return false;
      }
    }
    return true;
  }
}
module.exports = GArrayType;
