const GEdge = require('./GEdge.js');

class GViewerSourceEdge extends GEdge {

  async _canSee() {
    return this.getViewer().getID() === this.getFromID();
  }

  async _canCreate() {
    return false;
  }

  async _canModify() {
    return false;
  }
}

module.exports = GViewerSourceEdge;
