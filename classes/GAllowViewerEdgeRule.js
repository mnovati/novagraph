const GRule = require('./GRule.js');

class GAllowViewerEdgeRule extends GRule {

  constructor(type) {
    super();
    if (type !== 'source' && type !== 'dest' && type !== 'either') {
      type = 'either';
    }
    this.type = type;
  }

  async can(edge) {
    if (edge.getViewer().isLoggedOut()) {
      return this.skip();
    }
    var viewer_id = edge.getViewer().getID();
    switch (this.type) {
      case 'source':
        return viewer_id === edge.getFromID()? this.pass() : this.skip();
      case 'dest':
        return viewer_id === edge.getToID()? this.pass() : this.skip();
      case 'either':
      default:
        return (viewer_id === edge.getToID() || viewer_id === edge.getFromID()) ? this.pass() : this.skip();
    }
  }
}

module.exports = GAllowViewerEdgeRule;
