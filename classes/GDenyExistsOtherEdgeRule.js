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
    var other = await this.DB.getSingleEdge(
      edge.getViewer().getReadAllViewer(),
      edge.getFromID(),
      this.edge,
      edge.getToID(),
    );
    return other ? this.fail() : this.skip();
  }
}

module.exports = GDenyExistsOtherEdgeRule;
