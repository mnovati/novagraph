const GEdge = require('./GEdge.js');

class GPublicViewerWriteEdge extends GEdge {

  async _canSeeCustom() {
    return true;
  }

  async _canCreateCustom() {
    return this.getViewer().getID() === this.getToID() ||
      this.getViewer().getID() === this.getFromID();
  }

  async _canModifyCustom() {
    return await this.canCreate();
  }
}

module.exports = GPublicViewerWriteEdge;
