const GEdge = require('./GEdge.js');

class GPublicEdge extends GEdge {

  async _canSeeCustom() {
    return true;
  }

  async _canCreateCustom() {
    return false;
  }

  async _canModifyCustom() {
    return false;
  }
}

module.exports = GPublicEdge;
