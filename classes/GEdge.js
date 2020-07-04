class GEdge {

  constructor(DB, constants, viewer, edge) {
    this.DB = DB;
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

  async getAPIType() {
    var object = await this.DB.getObject(this.getViewer().getReadAllViewer(), this.getFromID());
    return (object ? object.getAPIType() : 'null') + '/' + this.Constants.Edges[this.getType()].api_name;
  }

  getData() {
    return this.edge.data ? this.edge.data : '';
  }

  async getRaw() {
    return Object.assign({}, this.edge);
  }

  // these are functions used internally that shouldn't be overwritten

  async canSee() {
    return await this._can(
      (this.Constants.getEdge(this.getType()).privacy || {}).cansee || []
    );
  }

  async canCreate() {
    return await this._can(
      (this.Constants.getEdge(this.getType()).privacy || {}).cancreate || []
    );
  }

  async canModify() {
    return await this._can(
      (this.Constants.getEdge(this.getType()).privacy || {}).canmodify || []
    );
  }

  async _can(rules) {
    for (var ii = 0; ii < rules.length; ii++) {
      var result = await rules[ii].withDB(this.DB).can(this);
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
