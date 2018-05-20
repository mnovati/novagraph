const GObject = require('./GObject.js');

class GPublicObject extends GObject {

  async _canSee() {
    return true;
  }

  async _canCreate() {
    return false;
  }

  async _canModify() {
    return false;
  }
}

module.exports = GPublicObject;
