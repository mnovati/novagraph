class Param {

  constructor(req) {
    this._req = req;
  }

  get(key) {
    if (key in this._req.query) {
      return this._req.query[key];
    } else if (key in this._req.body) {
      return this._req.body[key];
    } else if (key in this._req.params) {
      return this._req.params[key];
    } else if (key === 'token' && this._req.get('x-token')) {
      return this._req.get('x-token');
    }
    return null;
  }

  exists(key) {
    return key in this._req.query ||
      key in this._req.body ||
      key in this._req.params ||
      (key === 'token' && this._req.get('x-token'));
  }
}

module.exports = function (req) {
  return new Param(req);
}
