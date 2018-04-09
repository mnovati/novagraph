const GEdge = require('./GEdge.js');

class GViewerDestWriteEdge extends GEdge {

  async canSee() {
    return this.getViewer().getID() === this.getID2();
  }

  async canCreate() {
    return await this.canSee();
  }

  async canModify() {
    return await this.canSee();
  }
}

module.exports = GViewerDestWriteEdge;
