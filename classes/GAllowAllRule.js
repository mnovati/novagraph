const GRule = require('./GRule.js');

class GAllowAllRule extends GRule {

  async can(thing) {
    return this.pass();
  }
}

module.exports = GAllowAllRule;
