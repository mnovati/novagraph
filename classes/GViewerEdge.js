const GEdge = require('./GEdge.js');

class GViewerEdge extends GEdge {

  async _canSeeCustom() {
    return this.getViewer().getID() === this.getFromID() ||
      this.getViewer().getID() === this.getToID();
  }

  async _canCreateCustom() {
    return false;
  }

  async _canModifyCustom() {
    return false;
  }
}

module.exports = GViewerEdge;
