const GEdge = require('./GEdge.js');

class GViewerDestEdge extends GEdge {

  async _canSee() {
    return this.getViewer().getID() === this.getToID();
  }

  async _canCreate() {
    return false;
  }

  async _canModify() {
    return false;
  }
}

module.exports = GViewerDestEdge;
