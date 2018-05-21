const GRule = require('./GRule.js');

class GAllowViewerObjectRule extends GRule {

  async can(object) {
    return object.getViewer().getID() === object.getID() ? this.pass() : this.skip();
  }
}

module.exports = GAllowViewerObjectRule;
