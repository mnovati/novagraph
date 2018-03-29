class GObject {

  constructor(viewer, object) {
    this.viewer = viewer;
    this.object = object;
  }

  getViewer() {
    return this.viewer;
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
    return false;
  }

  async canCreate() {
    return false;
  }

  async canModify() {
    return false;
  }
}

module.exports = GObject;
