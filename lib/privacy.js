const Constants = require('./constants.js');

class Privacy {

  static init(config) {
    this._config = config;
  }

  static async canSeeObject(viewer, object) {
    if (!this._config) {
      throw new Error('Missing Privacy config, call Privacy.init');
    }
    this._config.can_see_object(viewer, object);
  }

  static async canCreateObject(viewer, type) {
    if (!this._config) {
      throw new Error('Missing Privacy config, call Privacy.init');
    }
    this._config.can_create_object(viewer, type);
  }

  static async canModifyObject(viewer, object) {
    if (!this._config) {
      throw new Error('Missing Privacy config, call Privacy.init');
    }
    this._config.can_modify_object(viewer, object);
  }

  static async canSeeEdge(viewer, edge) {
    if (!this._config) {
      throw new Error('Missing Privacy config, call Privacy.init');
    }
    this._config.can_see_edge(viewer, edge);
  }

  static async canCreateEdge(viewer, edge) {
    if (!this._config) {
      throw new Error('Missing Privacy config, call Privacy.init');
    }
    this._config.can_create_edge(viewer, edge);
  }

  static async canModifyEdge(viewer, edge) {
    if (!this._config) {
      throw new Error('Missing Privacy config, call Privacy.init');
    }
    this._config.can_modify_edge(viewer, edge);
  }
}

Privacy._config = null;

module.exports = Privacy;
