class GEdge {

  constructor(viewer, edge) {
    this.viewer = viewer;
    this.edge = edge;
  }

  getViewer() {
    return this.viewer;
  }

  getFromID() {
    return this.edge.from_id;
  }

  getToID() {
    return this.edge.to_id;
  }

  getType() {
    return this.edge.type;
  }

  getData() {
    return this.edge.data ? this.edge.data : '';
  }

  async getRaw() {
    return this.edge;
  }

  // these are functions used internally that shouldn't be overwritten

  async canSee() {
    return await this._canSeeCustom();
  }

  async canCreate() {
    return await this._canCreateCustom();
  }

  async canModify() {
    return await this._canModifyCustom();
  }

  // these are functions you should overwrite in your extensions of this object

  async _canSeeCustom() {
    return false;
  }

  async _canCreateCustom() {
    return false;
  }

  async _canModifyCustom() {
    return false;
  }
}

module.exports = GEdge;
