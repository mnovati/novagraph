const CognitoExpress = require("cognito-express");
const DB = require("./db.js");
const Viewer = require('./Viewer.js');

class CognitoValidator {

  static init(config) {
    this._config = config;
  }

  static async validate(viewer_id, token) {
    return new Promise((resolve, reject) => {
      if (this._config === null) {
        throw new Error('Missing config, call CognitoValidator.init');
      }
      if (!token) {
        throw new Error('Missing access token');
      }
      var cognito = new CognitoExpress(this._config);
      cognito.validate(token, (err, res) => {
        return err ? reject(err) : resolve(res);
      })
    }).then(async (response) => {
      var result = await DB.checkViewerID(viewer_id, response.sub);
      if (!result) {
        throw new Error('Incorrect viewer_id');
      }
      return new Viewer(viewer_id);
    });
  }
}

CognitoValidator._config = null;

module.exports = CognitoValidator;
