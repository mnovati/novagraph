const GObject = require('./GObject.js');

class GPublicObject extends GObject {

  async canSee() {
    return true;
  }

  async canCreate() {
    return false;
  }

  async canModify() {
    return false;
  }
}

module.exports = GPublicObject;
