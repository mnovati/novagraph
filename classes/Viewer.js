class Viewer {

  constructor(viewer_id) {
    this.id = viewer_id;
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
}

module.exports = Viewer;
