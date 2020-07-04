class GEdge {

  constructor(constants, viewer, edge) {
    this.Constants = constants;
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

  async getAPIType(DB) {
    var object = await DB.getObject(this.getViewer().getReadAllViewer(), this.getFromID());
    return (object ? object.getAPIType() : 'null') + '/' + this.Constants.Edges[this.getType()].api_name;
  }

  getData() {
    return this.edge.data ? this.edge.data : '';
  }

  async getRaw() {
    return Object.assign({}, this.edge);
  }

  // these are functions used internally that shouldn't be overwritten

  async canSee(DB) {
    return await this._can(
      DB,
      (this.Constants.getEdge(this.getType()).privacy || {}).cansee || []
    );
  }

  async canCreate(DB) {
    return await this._can(
      DB,
      (this.Constants.getEdge(this.getType()).privacy || {}).cancreate || []
    );
  }

  async canModify(DB) {
    return await this._can(
      DB,
      (this.Constants.getEdge(this.getType()).privacy || {}).canmodify || []
    );
  }

  async _can(DB, rules) {
    for (var ii = 0; ii < rules.length; ii++) {
      var result = await rules[ii].withDB(DB).can(this);
      if (result === 'PASS') {
        return true;
      } else if (result === 'FAIL') {
        return false;
      }
    }
    return false;
  }
}

module.exports = GEdge;
