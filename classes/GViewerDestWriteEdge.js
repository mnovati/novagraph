const GEdge = require('./GEdge.js');

class GViewerDestWriteEdge extends GEdge {

  async canSee() {
    return this.getViewer().getID() === this.getID2();
  }

  async canCreate() {
    return this.getViewer().getID() === this.getID2();
  }

  async canModify() {
    return this.getViewer().getID() === this.getID2();
  }
}

module.exports = GViewerDestWriteEdge;
