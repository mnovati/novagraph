const GObject = require('./GObject.js');

class GViewerWriteObject extends GObject {

  async canSee() {
    if (this.getViewer().getID() === this.getID()) {
      return true;
    }
    var data = await this.getData();
    return this.getViewer().getID() === data.creator_id;
  }

  async canCreate() {
    return await this.canSee();
  }

  async canModify() {
    return await this.canSee();
  }
}

module.exports = GViewerWriteObject;
