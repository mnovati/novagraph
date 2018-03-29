const Viewer = require('./Viewer.js');

class WriteAllViewer extends Viewer {

  isReadAll() {
    return true;
  }

  isWriteAll() {
    return true;
  }
}

module.exports = WriteAllViewer;
