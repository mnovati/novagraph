class GEdge {

  constructor(viewer, edge) {
    this.viewer = viewer;
    this.edge = edge;
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
    return this.edge.data;
  }

  getRaw() {
    return this.edge;
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

module.exports = GEdge;
