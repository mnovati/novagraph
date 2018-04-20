const GEdge = require('./GEdge.js');

class GPublicViewerWriteEdge extends GEdge {

  async canSee() {
    return true;
  }

  async canCreate() {
    return this.getViewer().getID() === this.getToID() ||
      this.getViewer().getID() === this.getFromID();
  }

  async canModify() {
    return await this.canCreate();
  }
}

module.exports = GPublicViewerWriteEdge;
