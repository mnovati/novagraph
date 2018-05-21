const GObject = require('./GObject.js');

class GPublicViewerWriteObject extends GObject {

  async _canSeeCustom() {
    return true;
  }

  async _canCreateCustom() {
    if (this.getViewer().getID() === this.getID()) {
      return true;
    }
    var data = await this.getData();
    return this.getViewer().getID() === data.creator_id;
  }

  async _canModifyCustom() {
    return await this.canCreate();
  }
}

module.exports = GPublicViewerWriteObject;
