const GObject = require('./GObject.js');

class GViewerWriteObject extends GObject {

  async _canSeeCustom() {
    if (this.getViewer().getID() === this.getID()) {
      return true;
    }
    var data = await this.getData();
    return this.getViewer().getID() === data.creator_id;
  }

  async _canCreateCustom() {
    return await this.canSee();
  }

  async _canModifyCustom() {
    return await this.canSee();
  }
}

module.exports = GViewerWriteObject;
