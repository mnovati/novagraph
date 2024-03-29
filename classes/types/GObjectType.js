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
      if (!out) { return; }
      if (key in value) {
        var result = await this.schema[key].withDB(this.DB).check(viewer, value[key]);
        if (!result) {
          out = false;
        }
      }
    }));
    return out;
  }
}

module.exports = GObjectType;
