const GEdge = require('./GEdge.js');

class GViewerWriteEdge extends GEdge {

  async canSee() {
    return this.getViewer().getID() === this.getID1();
  }

  async canCreate() {
    return this.getViewer().getID() === this.getID1();
  }

  async canModify() {
    return this.getViewer().getID() === this.getID1();
  }
}

module.exports = GViewerWriteEdge;
