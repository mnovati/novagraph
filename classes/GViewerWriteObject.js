const GObject = require('./GObject.js');

class GViewerWriteObject extends GObject {

  async _canSee() {
    if (this.getViewer().getID() === this.getID()) {
      return true;
    }
    var data = await this.getData();
    return this.getViewer().getID() === data.creator_id;
  }

  async _canCreate() {
    return await this.canSee();
  }

  async _canModify() {
    return await this.canSee();
  }
}

module.exports = GViewerWriteObject;
