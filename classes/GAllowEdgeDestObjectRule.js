const ReadAllViewer = require('./ReadAllViewer.js');
const GRule = require('./GRule.js');
const NError = require('../lib/error.js');

class GAllowEdgeDestObjectRule extends GRule {

  constructor(edges) {
    super();
    this.edges = edges;
  }

  async can(object) {
    if (object.getViewer().isLoggedOut()) {
      return this.skip();
    }
    const DB = require('../lib/db.js');
    if (!Array.isArray(this.edges)) {
      throw NError.normal('Invalid edges provided to edge-based privacy rule');
    }
    var result = await Promise.all(this.edges.map(async (e) => {
      var edges = await DB.getEdge(new ReadAllViewer(0), object.getID(), e);
      var objects = await Promise.all(edges.map(async (ee) => {
        var o = await DB.getObject(object.getViewer(), ee.getToID());
        return !!o;
      }));
      return objects.filter(Boolean).length > 0;
    }));
    return result.filter(Boolean).length > 0 ? this.pass() : this.skip();
  }
}

module.exports = GAllowEdgeDestObjectRule;
