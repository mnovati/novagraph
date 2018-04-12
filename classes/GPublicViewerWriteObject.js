const GObject = require('./GObject.js');

class GPublicViewerWriteObject extends GObject {

  async canSee() {
    return true;
  }

  async canCreate() {
    return this.getViewer().getID() === this.getID() ||
      this.getViewer().getID() === this.getData().creator_id;
  }

  async canModify() {
    return await this.canCreate();
  }
}

module.exports = GPublicViewerWriteObject;
