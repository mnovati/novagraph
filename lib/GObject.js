class GObject {

  constructor(viewer, object) {
    this.viewer = viewer;
    this.object = object;
  }

  getID() {
    return this.object.id;
  }

  getType() {
    return this.object.type;
  }

  getData() {
    return this.object.data;
  }

  getRaw() {
    return this.object;
  }

  async canSee() {
    return true;
  }

  async canCreate() {
    return true;
  }

  async canModify() {
    return true;
  }
}
