const GRule = require('./GRule.js');

class GAllowSourceObjectEdgeRule extends GRule {

  async can(edge) {
    const DB = require('../lib/db.js');
    var object = await DB.getObject(edge.getViewer(), edge.getFromID());
    return object ? this.pass() : this.skip();
  }
}

module.exports = GAllowSourceObjectEdgeRule;
