const GEdge = require('./GEdge.js');

class GViewerDestWriteEdge extends GEdge {

  async _canSeeCustom() {
    return this.getViewer().getID() === this.getToID();
  }

  async _canCreateCustom() {
    return await this.canSee();
  }

  async _canModifyCustom() {
    return await this.canSee();
  }
}

module.exports = GViewerDestWriteEdge;
