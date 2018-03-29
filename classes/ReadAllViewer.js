const Viewer = require('./Viewer.js');

class ReadAllViewer extends Viewer {

  isReadAll() {
    return true;
  }
}

module.exports = ReadAllViewer;
