const GEdge = require('./GEdge.js');

class GViewerEdge extends GEdge {

  async canSee() {
    return this.getViewer().getID() === this.getID1() ||
      this.getViewer().getID() === this.getID2();
  }

  async canCreate() {
    return false;
  }

  async canModify() {
    return false;
  }
}

module.exports = GViewerEdge;