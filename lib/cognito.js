const CognitoExpress = require('cognito-express');
const Constants = require('./constants.js');
const DB = require('./db.js');
const Viewer = require('../classes/Viewer.js');
const ReadAllViewer = require('../classes/ReadAllViewer.js');
const WriteAllViewer = require('../classes/WriteAllViewer.js');

class CognitoValidator {

  static init(config) {
    this._config = config;
  }

  static async getViewerID(uuid) {
    var edges = await DB.getEdge(new ReadAllViewer(0), uuid, 66536);
    if (!edges || edges.length !== 1) {
      return null;
    }
    return edges[0].id2;
  }

  static async uuid(token) {
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
      return response.sub;
    });
  }

  static async validate(token) {
    var uuid = await this.uuid(token);
    var viewer_id = await this.getViewerID(uuid);
    if (!viewer_id) {
      throw new Error('Incorrect viewer_id');
    }
    return new Viewer(viewer_id);
  }

  static async createUserAccount(token, data) {
    try {
      await this.validate(token);
      return null;
    } catch (e) {
      var uuid = await this.uuid(token);
      if (uuid) {
        data.cognito_uuid = uuid;
        var object_id = await DB.createObject(new WriteAllViewer(0), 0, data);
        if (object_id) {
          var viewer = new WriteAllViewer(object_id);
          await DB.createEdge(viewer, Constants.getEdgeInstance(viewer, {id1: uuid, id2: object_id, type: 65535}));
          return object_id;
        }
      }
      return null;
    }
  }
}

CognitoValidator._config = null;

module.exports = CognitoValidator;
