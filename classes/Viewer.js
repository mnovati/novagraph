class Viewer {

  constructor(viewer_id) {
    this.id = viewer_id;
    this.cache = {};
    this.pending = {};
    this.readAll = null;
    this._queryCount = 0;
  }

  getID() {
    return this.id;
  }

  isReadAll() {
    return false;
  }

  isWriteAll() {
    return false;
  }

  isLoggedOut() {
    return this.id === 0;
  }

  existsCache(key) {
    return key in this.cache;
  }

  fromCache(key) {
    return this.cache[key];
  }

  setCache(key, value) {
    this.cache[key] = value;
  }

  deleteCache(key) {
    delete this.cache[key];
  }

  existsPending(key) {
    return key in this.pending;
  }

  setPending(key) {
    this.pending[key] = true;
  }

  deletePending(key) {
    delete this.pending[key];
  }

  _incrQueryCount() {
    this.queryCount++;
  }

  _getQueryCount() {
    return this._queryCount;
  }

  getReadAllViewer() {
    if (this.isReadAll()) {
      return this;
    }
    if (this.readAll === null) {
      const ReadAllViewer = require('./ReadAllViewer.js');
      this.readAll = new ReadAllViewer(this.id);
    }
    return this.readAll;
  }
}

module.exports = Viewer;
