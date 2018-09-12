const uuidValidate = require('uuid-validate');

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

  getInt(key) {
    var value = this.get(key);
    return value === null ? null : parseInt(value);
  }

  getStr(key) {
    var value = this.get(key);
    return value === null ? null : String(value);
  }

  getBool(key) {
    var value = this.get(key);
    return (this.exists(key) && value === '') ||
      value === 'true' ||
      value === true ||
      parseInt(value) === 1;
  }

  getUUID(key) {
    var value = this.getStr(key);
    return (value && uuidValidate(value)) ? value : null;
  }

  getArr(key) {
    var value = this.get(key);
    if (value !== null && !Array.isArray(value)) {
      throw new Error('Array expected received incompatible value for: ' + key);
    }
    return value;
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
