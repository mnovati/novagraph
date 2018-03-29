const GEdge = require('./GEdge.js');

class GPublicEdge extends GEdge {

  async canSee() {
    return true;
  }

  async canCreate() {
    return false;
  }

  async canModify() {
    return false;
  }
}

module.exports = GPublicEdge;
