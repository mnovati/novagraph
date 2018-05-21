const GObject = require('./GObject.js');

class GPublicObject extends GObject {

  async _canSeeCustom() {
    return true;
  }

  async _canCreateCustom() {
    return false;
  }

  async _canModifyCustom() {
    return false;
  }
}

module.exports = GPublicObject;
