const GEdge = require('./GEdge.js');

class GViewerWriteEdge extends GEdge {

  async canSee() {
    return this.getViewer().getID() === this.getFromID() ||
      this.getViewer().getID() === this.getToID();
  }

  async canCreate() {
    return await this.canSee();
  }

  async canModify() {
    return await this.canSee();
  }
}

module.exports = GViewerWriteEdge;
