
class GType {

  constructor() {
    this.nullable = false;
  }

  setNull() {
    this.nullable = true;
    return this;
  }

  check(viewer, value) {
    if (value === null) {
      return !!this.nullable;
    }
    return this.checkImpl(viewer, value);
  }

  checkImpl(viewer, value) {
    return true;
  }

  normalize(value) {
    return this.normalizeImpl(value);
  }

  normalizeImpl(value) {
    return value;
  }
}
module.exports = GType;
