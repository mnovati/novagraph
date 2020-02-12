const GType = require('./GType.js');
const uuidValidate = require('uuid-validate');

class GUUIDType extends GType {

  constructor(types) {
    super();
    this.types = types || [];
  }

  checkImpl(viewer, value) {
    if (!uuidValidate(value)) {
      return false;
    }
    if (this.types.length > 0) {
      //const DB = require('../../lib/db.js');
      //var object = await DB.getObject(viewer.getReadAllViewer(), value);
      //if (!object || !this.types.includes(object.getType())) {
      //  return false;
      //}
    }
    return true;
  }
}
module.exports = GUUIDType;
