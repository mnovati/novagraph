
class GType {

  constructor() {
    this.nullable = false;
  }

  setNull() {
    this.nullable = true;
    return this;
  }

  async check(viewer, value) {
    if (value === null) {
      return !!this.nullable;
    }
    return await this.checkImpl(viewer, value);
  }

  async checkImpl(viewer, value) {
    return true;
  }

  async normalize(value) {
    return await this.normalizeImpl(value);
  }

  async normalizeImpl(value) {
    return value;
  }
}
module.exports = GType;
