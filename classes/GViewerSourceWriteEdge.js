const GEdge = require('./GEdge.js');

class GViewerSourceWriteEdge extends GEdge {

  async _canSee() {
    return this.getViewer().getID() === this.getFromID();
  }

  async _canCreate() {
    return await this.canSee();
  }

  async _canModify() {
    return await this.canSee();
  }
}

module.exports = GViewerSourceWriteEdge;
