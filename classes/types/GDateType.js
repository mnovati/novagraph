const GType = require('./GType.js');

class GDateType extends GType {

  constructor() {
    super();
  }

  async checkImpl(viewer, value) {
    return !isNaN(new Date(value));
  }
}
module.exports = GDateType;
