const GEdge = require('./GEdge.js');

class GViewerSourceEdge extends GEdge {

  async _canSeeCustom() {
    return this.getViewer().getID() === this.getFromID();
  }

  async _canCreateCustom() {
    return false;
  }

  async _canModifyCustom() {
    return false;
  }
}

module.exports = GViewerSourceEdge;
