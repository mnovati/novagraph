const GType = require('./GType.js');

class GObjectType extends GType {

  constructor(schema) {
    super();
    this.schema = schema || {};
  }

  async checkImpl(viewer, value) {
    if (!(value instanceof Object)) {
      return false;
    }
    var out = true;
    await Promise.all(Object.keys(this.schema).map(async key => {
      if (key in value) {
        var result = await this.schema[key].check(viewer, value[key]);
        if (!result) {
          out = false;
        }
      }
    }));
    return out;
  }
}

module.exports = GObjectType;
