const GRule = require('./GRule.js');

class GDenyNotViewerEdgeRule extends GRule {

  async can(edge) {
    if (edge.getViewer().isLoggedOut()) {
      return this.fail();
    }
    var viewer_id = edge.getViewer().getID();
    return (viewer_id === edge.getToID() || viewer_id === edge.getFromID()) ? this.skip() : this.fail();
  }
}

module.exports = GDenyNotViewerEdgeRule;
