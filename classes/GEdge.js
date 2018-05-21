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
    const Constants = require('../lib/constants.js');
    return await this._can(
      (Constants.Edges[this.getType()].privacy || {}).cansee || [],
      this._canSeeCustom.bind(this)
    );
  }

  async canCreate() {
    const Constants = require('../lib/constants.js');
    return await this._can(
      (Constants.Edges[this.getType()].privacy || {}).cancreate || [],
      this._canCreateCustom.bind(this)
    );
  }

  async canModify() {
    const Constants = require('../lib/constants.js');
    return await this._can(
      (Constants.Edges[this.getType()].privacy || {}).canmodify || [],
      this._canModifyCustom.bind(this)
    );
  }

  async _can(rules, fallback) {
    if (rules.length > 0) {
      for (var ii = 0; ii < rules.length; ii++) {
        var result = await rules[ii].can(this);
        if (result === 'PASS') {
          return true;
        } else if (result === 'FAIL') {
          return false;
        }
      }
    } else {
      return await fallback();
    }
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
