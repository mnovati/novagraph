const GAllowAllRule = require('./GAllowAllRule.js');

class GObject {

  constructor(viewer, object) {
    this.viewer = viewer;
    this.object = object;
    this.DB = null;
  }

  withDB(DB) {
    this.DB = DB;
    return this;
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
    return this.DB.Constants.Objects[this.getType()].api_name;
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
    return await this._can(
      ((this.DB.Constants.getObject(this.getType()).field_privacy || {})[key] || this.DB.Constants.getObject(this.getType()).field_privacy_fallback || {}).cansee || [new GAllowAllRule()]
    );
  }

  async canModifyField(key) {
    return await this._can(
      ((this.DB.Constants.getObject(this.getType()).field_privacy || {})[key] || this.DB.Constants.getObject(this.getType()).field_privacy_fallback || {}).canmodify || [new GAllowAllRule()]
    );
  }

  async canCreateField(key) {
    var config = (this.DB.Constants.getObject(this.getType()).field_privacy || {})[key] || this.DB.Constants.getObject(this.getType()).field_privacy_fallback || {};
    return await this._can(config.cancreate || config.canmodify || [new GAllowAllRule()]);
  }

  // these are functions used internally that shouldn't be overwritten

  async canSee() {
    return await this._can(
      (this.DB.Constants.getObject(this.getType()).privacy || {}).cansee || []
    );
  }

  async canCreate() {
    return await this._can(
      (this.DB.Constants.getObject(this.getType()).privacy || {}).cancreate || []
    );
  }

  async canModify() {
    return await this._can(
      (this.DB.Constants.getObject(this.getType()).privacy || {}).canmodify || []
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

module.exports = GObject;
