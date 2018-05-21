
class GRule {

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
