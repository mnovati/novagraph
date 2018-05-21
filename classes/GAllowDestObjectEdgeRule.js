const GRule = require('./GRule.js');

class GAllowDestObjectEdgeRule extends GRule {

  async can(edge) {
    const DB = require('../lib/db.js');
    var object = await DB.getObject(edge.getViewer(), edge.getToID());
    return object ? this.pass() : this.skip();
  }
}

module.exports = GAllowDestObjectEdgeRule;
