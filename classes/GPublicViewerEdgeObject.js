const GViewerEdgeObject = require('./GViewerEdgeObject.js');

class GPublicViewerEdgeObject extends GViewerEdgeObject {

  async _canSeeCustom() {
    return true;
  }

  async _canCreateCustom() {
    return true;
  }

}

module.exports = GPublicViewerEdgeObject;
