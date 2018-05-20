const GObject = require('./GObject.js');

class GProfileObject extends GObject {

  async _canSee() {
    return this.getViewer().getID() === this.getID();
  }

  async _canCreate() {
    return false;
  }

  async _canModify() {
    return this.getViewer().getID() === this.getID();
  }
}

module.exports = GProfileObject;
