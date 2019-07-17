const GType = require('./GType.js');
const uuidValidate = require('uuid-validate');

class GUUIDType extends GType {

  constructor() {
    super();
  }

  checkImpl(value) {
    return uuidValidate(value);
  }
}
module.exports = GUUIDType;
