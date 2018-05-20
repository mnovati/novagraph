const GEdge = require('./GEdge.js');

class GPublicViewerWriteEdge extends GEdge {

  async _canSee() {
    return true;
  }

  async _canCreate() {
    return this.getViewer().getID() === this.getToID() ||
      this.getViewer().getID() === this.getFromID();
  }

  async _canModify() {
    return await this.canCreate();
  }
}

module.exports = GPublicViewerWriteEdge;
