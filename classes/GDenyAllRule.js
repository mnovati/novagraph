const GRule = require('./GRule.js');

class GDenyAllRule extends GRule {

  async can(thing) {
    return this.fail();
  }
}

module.exports = GDenyAllRule;
