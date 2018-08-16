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

  getAPIType() {
    const Constants = require('../lib/constants.js');
    Constants.Objects[this.getType()].api_name;
  }

  async getData() {
    return this.object.data;
  }

  async getRaw() {
    return Object.assign({}, this.object);
  }

  // these are functions used internally that shouldn't be overwritten

  async canSee() {
    const Constants = require('../lib/constants.js');
    return await this._can(
      (Constants.getObject(this.getType()).privacy || {}).cansee || []
    );
  }

  async canCreate() {
    const Constants = require('../lib/constants.js');
    return await this._can(
      (Constants.getObject(this.getType()).privacy || {}).cancreate || []
    );
  }

  async canModify() {
    const Constants = require('../lib/constants.js');
    return await this._can(
      (Constants.getObject(this.getType()).privacy || {}).canmodify || []
    );
  }

  async _can(rules, fallback) {
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

module.exports = GObject;
