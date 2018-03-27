class GEdge {

  constructor(edge) {
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
}
