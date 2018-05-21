const GRule = require('./GRule.js');

class GAllowObjectCreatorEdgeRule extends GRule {

  async can(edge) {
    const DB = require('../lib/db.js');
    var [dest, source] = await Promise.all([
      DB.getObject(edge.getViewer(), edge.getToID()),
      DB.getObject(edge.getViewer(), edge.getFromID()),
    ]);
    if (!dest || !source) {
      return this.skip();
    }
    return (dest.object.data.creator_id === edge.getViewer().getID() ||
            source.object.data.creator_id === edge.getViewer().getID()) ? this.pass() : this.skip();
  }
}

module.exports = GAllowObjectCreatorEdgeRule;
