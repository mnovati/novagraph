const GEdge = require('./GEdge.js');

class GViewerWriteEdge extends GEdge {

  async canSee() {
    return this.getViewer().getID() === this.getID1() ||
      this.getViewer().getID() === this.getID2();
  }

  async canCreate() {
    return this.getViewer().getID() === this.getID1() ||
      this.getViewer().getID() === this.getID2();
  }

  async canModify() {
    return this.getViewer().getID() === this.getID1() ||
      this.getViewer().getID() === this.getID2();
  }
}

module.exports = GViewerWriteEdge;
