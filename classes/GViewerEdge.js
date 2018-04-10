const GEdge = require('./GEdge.js');

class GViewerEdge extends GEdge {

  async canSee() {
    return this.getViewer().getID() === this.getFromID() ||
      this.getViewer().getID() === this.getToID();
  }

  async canCreate() {
    return false;
  }

  async canModify() {
    return false;
  }
}

module.exports = GViewerEdge;
