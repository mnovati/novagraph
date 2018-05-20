const GViewerEdgeObject = require('./GViewerEdgeObject.js');

class GPublicViewerEdgeObject extends GViewerEdgeObject {

  async _canSee() {
    return true;
  }

  async _canCreate() {
    return true;
  }

}

module.exports = GPublicViewerEdgeObject;
