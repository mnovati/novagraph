const GType = require('./GType.js');

class GMapType extends GType {

  constructor(k_type, v_type) {
    super();
    this.key_type = k_type;
    this.value_type = v_type;
  }

  async checkImpl(viewer, value) {
    if (!(value instanceof Object)) {
      return false;
    }
    var out = true;
    await Promise.all(Object.keys(value).map(async key => {
      if (!out) { return; }
      var k_result = await this.key_type.withDB(this.DB).check(viewer, key);
      var v_result = await this.value_type.withDB(this.DB).check(viewer, value[key]);
      if (!k_result || !k_result) {
        out = false;
      }
    }));
    return out;
  }
}

module.exports = GMapType;
