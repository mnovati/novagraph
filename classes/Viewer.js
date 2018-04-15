class Viewer {

  constructor(viewer_id) {
    this.id = viewer_id;
    this.cache = {};
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
}

module.exports = Viewer;
