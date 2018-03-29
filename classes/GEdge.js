class GEdge {

  constructor(viewer, edge) {
    this.viewer = viewer;
    this.edge = edge;
  }

  getViewer() {
    return this.viewer;
  }

  getID1() {
    return this.edge.id1;
  }

  getID2() {
    return this.edge.id2;
  }

  getType() {
    return this.edge.type;
  }

  getData() {
    return this.edge.data ? this.edge.data : '';
  }

  getRaw() {
    return this.edge;
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

module.exports = GEdge;
