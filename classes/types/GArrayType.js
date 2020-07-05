const GType = require('./GType.js');

class GArrayType extends GType {

  constructor(type) {
    super();
    this.type = type || null;
  }

  async checkImpl(viewer, value) {
    if (!Array.isArray(value)) {
      return false;
    }
    // array of unspecified types
    if (!this.type) {
      return true;
    }
    var each = await Promise.all(value.map(async v => {
      return await this.type.withDB(this.DB).check(viewer, v);
    }));
    return each.filter(Boolean).length === value.length;
  }
}
module.exports = GArrayType;
