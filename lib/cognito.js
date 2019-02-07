const CognitoExpress = require('cognito-express');
const Constants = require('./constants.js');
const DB = require('./db.js');
const NError = require('./error.js');
const Viewer = require('../classes/Viewer.js');
const ReadAllViewer = require('../classes/ReadAllViewer.js');
const WriteAllViewer = require('../classes/WriteAllViewer.js');

class CognitoValidator {

  static init(config) {
    this._config = config;
  }

  static async getViewerID(uuid) {
    var edges = await DB.getEdge(new ReadAllViewer(0), uuid, Constants.COGNITO_EDGE);
    if (!edges || edges.length !== 1) {
      return null;
    }
    return edges[0].getToID();
  }

  static async uuid(token) {
    return new Promise((resolve, reject) => {
      if (this._config === null) {
        throw NError.normal('Missing Cognito config, call CognitoValidator.init');
      }
      if (!token) {
        throw NError.normal('Missing Cognito access token');
      }
      var cognito = new CognitoExpress(this._config);
      cognito.validate(token, (err, res) => {
        return err ? reject(NError.normal('Token error', { error: err })) : resolve(res);
      })
    }).then(async (response) => {
      if (!response || !response.sub) {
        throw NError.normal('Missing Cognito uuid in access token');
      }
      return response.sub;
    });
  }

  static async validate(token) {
    var uuid = await this.uuid(token);
    var viewer_id = await this.getViewerID(uuid);
    if (!viewer_id) {
      throw NError.normal('Unknown profile id for Cognito uuid', { uuid: uuid });
    }
    return new Viewer(viewer_id);
  }

  static async createUserAccountFromProfile(token, profile_id, data) {
    if (!data) {
      throw NError.normal('Missing data for creating user account');
    }
    var viewer = null;
    try {
      viewer = await this.validate(token);
    } catch (e) {
      var uuid = await this.uuid(token);
      if (uuid) {
        var existing = await DB.getObject(new WriteAllViewer(0), profile_id);
        if (!existing) {
          throw NError.normal('Error reading existing profile');
        }
        var old_data = await existing.getData();
        if (old_data.cognito_uuid) {
          throw NError.normal('Existing profile already contains cognito id');
        }
        for (var key in data) {
          old_data[key] = data[key];
        }
        old_data.creator_id = profile_id;
        old_data.cognito_uuid = uuid;

        existing.object.data = old_data;
        var result = await DB.modifyObject(new WriteAllViewer(0), existing);
        if (result) {
          var viewer = new WriteAllViewer(profile_id);
          await DB.createEdge(viewer, Constants.getEdgeInstance(viewer, {from_id: uuid, to_id: profile_id, type: Constants.COGNITO_EDGE}));
          return profile_id;
        }
      }
      throw NError.normal('Error creating object for Cognito uuid', { uuid: uuid });
    }
    if (viewer) {
      throw NError.normal('Profile already exists for Cognito token', { id: viewer.getID() });
    }
  }

  static async createUserAccount(token, data) {
    if (!data) {
      throw NError.normal('Missing data for creating user account');
    }
    var viewer = null;
    try {
      viewer = await this.validate(token);
    } catch (e) {
      var uuid = await this.uuid(token);
      if (uuid) {
        data.cognito_uuid = uuid;
        var object_id = await DB.createObject(new WriteAllViewer(0), 0, data);
        if (object_id) {
          var viewer = new WriteAllViewer(object_id);
          await DB.createEdge(viewer, Constants.getEdgeInstance(viewer, {from_id: uuid, to_id: object_id, type: Constants.COGNITO_EDGE}));
          await DB.modifyObject(viewer,
            Constants.getObjectInstance(viewer, { id: object_id, type: 0, data: { creator_id: object_id} })
          );
          return object_id;
        }
      }
      throw NError.normal('Error creating object for Cognito uuid', { uuid: uuid });
    }
    if (viewer) {
      throw NError.normal('Profile already exists for Cognito token', { id: viewer.getID() });
    }
  }
}

CognitoValidator._config = null;

module.exports = CognitoValidator;
