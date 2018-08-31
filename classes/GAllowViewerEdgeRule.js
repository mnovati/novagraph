const GRule = require('./GRule.js');

class GAllowViewerEdgeRule extends GRule {

  async can(edge) {
    if (edge.getViewer().isLoggedOut()) {
      return this.skip();
    }
    var viewer_id = edge.getViewer().getID();
    return (viewer_id === edge.getToID() || viewer_id === edge.getFromID()) ? this.pass() : this.skip();
  }
}

module.exports = GAllowViewerEdgeRule;
