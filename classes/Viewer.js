class Viewer {

  constructor(viewer_id) {
    this.id = viewer_id;
    this.cache = {};
    this.pending = {};
    this.readAll = null;
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
