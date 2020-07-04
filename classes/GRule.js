
class GRule {

  withDB(DB) {
    this.DB = DB;
    return this;
  }

  pass() {
    return 'PASS';
  }

  fail() {
    return 'FAIL';
  }

  skip() {
    return 'SKIP';
  }

  async can(thing) {
    return fail();
  }
}
module.exports = GRule;
