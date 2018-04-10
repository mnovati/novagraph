const GEdge = require('./GEdge.js');

class GViewerSourceEdge extends GEdge {

  async canSee() {
    return this.getViewer().getID() === this.getFromID();
  }

  async canCreate() {
    return false;
  }

  async canModify() {
    return false;
  }
}

module.exports = GViewerSourceEdge;
