const GEdge = require('./GEdge.js');

class GPublicEdge extends GEdge {

  async _canSee() {
    return true;
  }

  async _canCreate() {
    return false;
  }

  async _canModify() {
    return false;
  }
}

module.exports = GPublicEdge;
