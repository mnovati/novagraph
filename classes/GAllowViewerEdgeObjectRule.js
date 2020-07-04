const ReadAllViewer = require('./ReadAllViewer.js');
const GRule = require('./GRule.js');
const NError = require('../lib/error.js');

class GAllowViewerEdgeObjectRule extends GRule {

  constructor(edges, type, field_id) {
    super();
    this.edges = edges;
    if (type !== 'source' && type !== 'dest') {
      type = 'dest';
    }
    this.type = type;
    this.field_id = field_id || null;
  }

  async can(object) {
    if (object.getViewer().isLoggedOut()) {
      return this.skip();
    }
    if (!Array.isArray(this.edges)) {
      throw NError.normal('Invalid edges provided to edge-based privacy rule');
    }
    var target_id = this.field_id ? object.object.data[field_id] : object.getID();
    var result = await Promise.all(this.edges.map(async (e) => {
      var edge = await this.DB.getSingleEdge(
        new ReadAllViewer(0),
        this.type === 'dest' ? target_id : object.getViewer().getID(),
        e,
        this.type === 'dest' ? object.getViewer().getID() : target_id,
      );
      return !!edge;
    }));
    return result.filter(Boolean).length > 0 ? this.pass() : this.skip();
  }
}

module.exports = GAllowViewerEdgeObjectRule;
