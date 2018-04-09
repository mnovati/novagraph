const GObject = require('./GObject.js');

class GProfileObject extends GObject {

  async canSee() {
    return this.getViewer().getID() === this.getID();
  }

  async canCreate() {
    return false;
  }

  async canModify() {
    return this.getViewer().getID() === this.getID();
  }
}

module.exports = GProfileObject;
