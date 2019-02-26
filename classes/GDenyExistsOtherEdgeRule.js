const GRule = require('./GRule.js');

class GDenyExistsOtherEdgeRule extends GRule {

  constructor(edge) {
    super();
    this.edge = edge;
  }

  async can(edge) {
    if (edge.getViewer().isLoggedOut()) {
      return this.skip();
    }
    const DB = require('../lib/db.js');
    var other = await DB.getSingleEdge(
      edge.getViewer().getReadAllViewer(),
      edge.getFromID(),
      this.edge,
      edge.getToID(),
    );
    return other ? this.fail() : this.skip();
  }
}

module.exports = GDenyExistsOtherEdgeRule;
