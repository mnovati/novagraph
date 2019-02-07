const GRule = require('./GRule.js');
const NError = require('../lib/error.js');

class GAllowObjectEdgeRule extends GRule {

  constructor(type) {
    super();
    if (type !== 'source' && type !== 'dest' && type !== 'both' && type !== 'either') {
      throw NError.normal('Type must be source, dest, both, or either');
    }
    this.type = type;
  }

  async can(edge) {
    const DB = require('../lib/db.js');
    var [dest, source] = await Promise.all([
      DB.getObject(edge.getViewer(), edge.getToID()),
      DB.getObject(edge.getViewer(), edge.getFromID()),
    ]);
    if (this.type === 'source') {
      return source ? this.pass() : this.skip();
    } else if (this.type === 'dest') {
      return dest ? this.pass() : this.skip();
    } else if (this.type === 'either') {
      return (source || dest) ? this.pass() : this.skip();
    } else if (this.type === 'both') {
      return (source && dest) ? this.pass() : this.skip();
    } else {
      throw NError.normal('Type must be source, dest, or both');
    }
  }
}

module.exports = GAllowObjectEdgeRule;
