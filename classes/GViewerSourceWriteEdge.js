const GEdge = require('./GEdge.js');

class GViewerSourceWriteEdge extends GEdge {

  async _canSeeCustom() {
    return this.getViewer().getID() === this.getFromID();
  }

  async _canCreateCustom() {
    return await this.canSee();
  }

  async _canModifyCustom() {
    return await this.canSee();
  }
}

module.exports = GViewerSourceWriteEdge;
