const GEdge = require('./GEdge.js');

class GViewerDestEdge extends GEdge {

  async _canSeeCustom() {
    return this.getViewer().getID() === this.getToID();
  }

  async _canCreateCustom() {
    return false;
  }

  async _canModifyCustom() {
    return false;
  }
}

module.exports = GViewerDestEdge;
