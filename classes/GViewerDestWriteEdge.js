const GEdge = require('./GEdge.js');

class GViewerDestWriteEdge extends GEdge {

  async _canSee() {
    return this.getViewer().getID() === this.getToID();
  }

  async _canCreate() {
    return await this.canSee();
  }

  async _canModify() {
    return await this.canSee();
  }
}

module.exports = GViewerDestWriteEdge;
