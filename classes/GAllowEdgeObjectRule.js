const ReadAllViewer = require('./ReadAllViewer.js');
const GRule = require('./GRule.js');

class GAllowEdgeObjectRule extends GRule {

  constructor(edges) {
    this.edges = edges;
  }

  async can(object) {
    const DB = require('../lib/db.js');
    if (!Array.isArray(this.edges)) {
      throw new Error('Invalid edges provided to edge-based privacy rule');
    }
    var result = await Promise.all(this.edges.map(async (e) => {
      var edge = await DB.getSingleEdge(new ReadAllViewer(0), object.getID(), e, object.getViewer().getID());
      return !!edge;
    }));
    return result.filter(Boolean).length > 0 ? this.pass() : this.skip();
  }
}

module.exports = GAllowEdgeObjectRule;
