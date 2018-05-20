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

  static setGlobalCanSee(fun) {
    GEdge._globalCanSee = fun;
  }

  async canSee() {
    var global = await GEdge._globalCanSee(this);
    if (!global) {
      return false;
    }
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

GEdge._globalCanSee = async function(edge) {
  return true;
}

module.exports = GEdge;
