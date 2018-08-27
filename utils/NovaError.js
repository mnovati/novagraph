class NovaError {

  static setHandler(f) {
    this._handler = f;
  }

  static throwError(error_msg) {
    throw new Error(error_msg);
  }

  static log(req, error) {
    var bundle = {
      request_url: req.method + ':' + req.path,
      request_time: new Date().toUTCString(),
      viewer_id: req.viewer ? req.viewer.getID() : 0,
      error: error
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