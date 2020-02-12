const GType = require('./GType.js');

class GArrayType extends GType {

  constructor(type) {
    super();
    this.type = type;
  }

  async checkImpl(viewer, value) {
    if (!Array.isArray(value)) {
      return false;
    }
    var each = await Promise.all(value.map(async v => {
      return await this.type.check(viewer, v);
    }));
    return each.filter(Boolean).length === value.length;
  }
}
module.exports = GArrayType;
