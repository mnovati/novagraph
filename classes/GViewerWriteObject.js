const GObject = require('./GObject.js');

class GViewerWriteObject extends GObject {

  async canSee() {
    return this.getViewer().getID() === this.getID() ||
      this.getViewer().getID() === this.getData().creator_id;
  }

  async canCreate() {
    return false;
  }

  async canModify() {
    return this.getViewer().getID() === this.getID() ||
      this.getViewer().getID() === this.getData().creator_id;
  }
}

module.exports = GViewerWriteObject;
