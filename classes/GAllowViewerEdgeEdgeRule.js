const ReadAllViewer = require('./ReadAllViewer.js');
const GRule = require('./GRule.js');

class GAllowViewerEdgeEdgeRule extends GRule {

  constructor(type, edges) {
    if (type !== 'source' && type !== 'dest') {
      throw new Error('Type must be source, dest, both, or either');
    }
    this.type = type;
    this.edges = edges;
  }

  async can(edge) {
    if (edge.getViewer().isLoggedOut()) {
      return this.skip();
    }
    const DB = require('../lib/db.js');
    if (!Array.isArray(this.edges)) {
      throw new Error('Invalid edges provided to edge-based privacy rule');
    }
    var result = await Promise.all(this.edges.map(async (e) => {
      var exists = await DB.getSingleEdge(
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
