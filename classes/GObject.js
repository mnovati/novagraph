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

  async getData() {
    return this.object.data;
  }

  async getRaw() {
    return this.object;
  }

  // these are functions used internally that shouldn't be overwritten

  async canSee() {
    return await this._canSee();
  }

  async canCreate() {
    return await this._canCreate();
  }

  async canModify() {
    return await this._canModify();
  }

  // these are functions you should overwrite in your extensions of this object

  async _canSee() {
    return false;
  }

  async _canCreate() {
    return false;
  }

  async _canModify() {
    return false;
  }
}

module.exports = GObject;
