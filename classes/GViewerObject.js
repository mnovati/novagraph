const GObject = require('./GObject.js');

class GViewerObject extends GObject {

  async canSee() {
    if (this.getViewer().getID() === this.getID()) {
      return true;
    }
    var data = await this.getData();
    return this.getViewer().getID() === data.creator_id;
  }

  async canCreate() {
    return false;
  }

  async canModify() {
    return false;
  }
}

module.exports = GViewerObject;
