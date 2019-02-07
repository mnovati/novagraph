class NovaError {

  static setHandler(f) {
    this._handler = f;
  }

  static log(req, error) {
    var bundle = {
      request_url: req.method + ':' + req.path,
      request_time: new Date().toUTCString(),
      viewer_id: req.viewer ? req.viewer.getID() : 0,
      level: error.level,
      error: error
      context: error.context,
    };
    console.error(bundle);
    if (this._handler) {
      this._handler(bundle);
    }
    return error;
  }
}

NovaError._handler = null;

module.exports = NovaError;
