const GEdge = require('./GEdge.js');

class GViewerSourceWriteEdge extends GEdge {

  async canSee() {
    return this.getViewer().getID() === this.getID1();
  }

  async canCreate() {
    return await this.canSee();
  }

  async canModify() {
    return await this.canSee();
  }
}

module.exports = GViewerSourceWriteEdge;
