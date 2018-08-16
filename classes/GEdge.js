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

  async getAPIType() {
    const Constants = require('../lib/constants.js');
    const DB = require('../lib/db.js');
    var object = await DB.getObject(this.getViewer().getReadAllViewer(), this.getFromID());
    return (object ? object.getAPIType() : 'null') + '/' + Constants.Edges[this.getType()].api_name;
  }

  getData() {
    return this.edge.data ? this.edge.data : '';
  }

  async getRaw() {
    return Object.assign({}, this.edge);
  }

  // these are functions used internally that shouldn't be overwritten

  async canSee() {
    const Constants = require('../lib/constants.js');
    return await this._can(
      (Constants.getEdge(this.getType()).privacy || {}).cansee || []
    );
  }

  async canCreate() {
    const Constants = require('../lib/constants.js');
    return await this._can(
      (Constants.getEdge(this.getType()).privacy || {}).cancreate || []
    );
  }

  async canModify() {
    const Constants = require('../lib/constants.js');
    return await this._can(
      (Constants.getEdge(this.getType()).privacy || {}).canmodify || []
    );
  }

  async _can(rules) {
    for (var ii = 0; ii < rules.length; ii++) {
      var result = await rules[ii].can(this);
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
