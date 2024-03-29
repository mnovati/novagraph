const ReadAllViewer = require('./ReadAllViewer.js');
const GRule = require('./GRule.js');
const NError = require('../lib/error.js');

class GAllowViewerEdgeEdgeRule extends GRule {

  constructor(type, edges) {
    super();
    if (type !== 'source' && type !== 'dest') {
      throw NError.normal('Type must be source, dest, both, or either');
    }
    this.type = type;
    this.edges = edges;
  }

  async can(edge) {
    if (edge.getViewer().isLoggedOut()) {
      return this.skip();
    }
    if (!Array.isArray(this.edges)) {
      throw NError.normal('Invalid edges provided to edge-based privacy rule');
    }
    var result = await Promise.all(this.edges.map(async (e) => {
      var exists = await this.DB.getSingleEdge(
        new ReadAllViewer(0),
        this.type === 'source' ? edge.getFromID() : edge.getToID(),
        e,
        edge.getViewer().getID()
      );
      return !!exists;
    }));
    return result.filter(Boolean).length > 0 ? this.pass() : this.skip();
  }
}

module.exports = GAllowViewerEdgeEdgeRule;
