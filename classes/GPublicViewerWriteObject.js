const GObject = require('./GObject.js');

class GPublicViewerWriteObject extends GObject {

  async _canSee() {
    return true;
  }

  async _canCreate() {
    if (this.getViewer().getID() === this.getID()) {
      return true;
    }
    var data = await this.getData();
    return this.getViewer().getID() === data.creator_id;
  }

  async _canModify() {
    return await this.canCreate();
  }
}

module.exports = GPublicViewerWriteObject;
