const GObject = require('./GObject.js');

class GProfileObject extends GObject {

  async _canSeeCustom() {
    return this.getViewer().getID() === this.getID();
  }

  async _canCreateCustom() {
    return false;
  }

  async _canModifyCustom() {
    return this.getViewer().getID() === this.getID();
  }
}

module.exports = GProfileObject;
