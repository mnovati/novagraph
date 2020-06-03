const GAllowAllRule = require('./GAllowAllRule.js');

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
    return Constants.Objects[this.getType()].api_name;
  }

  async getData() {
    return this.object.data;
  }

  async getViewerData() {
    return {};
  }

  async getRaw() {
    var base = Object.assign({}, this.object);
    var processed_data = await this.getData();
    base.data = await this.getData();
    var viewer_data = await this.getViewerData();
    if (Object.keys(viewer_data).length > 0) {
      base.viewer_data = await viewer_data;
    }
    return Object.assign({}, base);
  }

  async canSeeField(key) {
    const Constants = require('../lib/constants.js');
    return await this._can(
      ((Constants.getObject(this.getType()).field_privacy || {})[key] || Constants.getObject(this.getType()).field_privacy_fallback || {}).cansee || [new GAllowAllRule()]
    );
  }

  async canModifyField(key) {
    const Constants = require('../lib/constants.js');
    return await this._can(
      ((Constants.getObject(this.getType()).field_privacy || {})[key] || Constants.getObject(this.getType()).field_privacy_fallback || {}).canmodify || [new GAllowAllRule()]
    );
  }

  async canCreateField(key) {
    const Constants = require('../lib/constants.js');
    var config = (Constants.getObject(this.getType()).field_privacy || {})[key] || Constants.getObject(this.getType()).field_privacy_fallback || {};
    return await this._can(config.cancreate || config.canmodify || [new GAllowAllRule()]);
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
