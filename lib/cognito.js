const NError = require('./error.js');
const Viewer = require('../classes/Viewer.js');
const ReadAllViewer = require('../classes/ReadAllViewer.js');
const WriteAllViewer = require('../classes/WriteAllViewer.js');

const jwksClient = require('jwks-rsa');
const jwt = require('jsonwebtoken');

var _keys = {};

function r2u(response) {
  return response && response.sub && response.sub.split(':').pop();
}

function r2f(response) {
  if ('username' in response) {
    return (response.username || '').toLowerCase();
  } else if ('amr' in response && response.amr.length > 0) {
    for (var ii = 0; ii < response.amr.length; ii++) {
      var row = response.amr[ii];
      if (row.startsWith('accounts.google.com:')) {
        return 'google_' + row.split(':').pop();
      }
      if (row.startsWith('graph.facebook.com:')) {
        return 'facebook_' + row.split(':').pop();
      }
      if (row.startsWith('cognito-idp.') && row.includes('CognitoSignIn')) {
        return row.split(':').pop();
      }
    }
  }
  return null;
}

class Cognito {

  constructor(config) {
    this._config = config;
  }

  withDB(DB) {
    this._DB = DB;
    return this;
  }

  async getViewerID(uuid) {
    var edges = await this._DB.getEdge(new ReadAllViewer(0), uuid, this._DB.Constants.COGNITO_EDGE);
    if (!edges || edges.length === 0) {
      return null;
    }
    for (var ii = edges.length - 1; ii >= 0; ii--) {
      try {
        var object = await this._DB.getObject(new ReadAllViewer(0), edges[ii].getToID());
        if (object) {
          return edges[ii].getToID();
        }
      } catch (e) {}
    }
    return null;
  }

  async uuid(token) {
    var response = await this.user(token);
    return r2u(response);
  }

  async user(token) {
    return new Promise((resolve, reject) => {
      if (!token) {
        throw NError.normal('Missing Cognito access token');
      }

      var temp = jwt.decode(token, { complete: true });
      if (!temp) {
        throw NError.normal('Token could not be decoded');
      }
      var cert = null;
      if (temp.payload.iss === 'https://cognito-identity.amazonaws.com') {
        if (temp.payload.aud !== this._config.cognitoIdentityPoolId) {
          throw NError.normal('Token does not match the expected source');
        }
        cert = 'https://cognito-identity.amazonaws.com/.well-known/jwks_uri';
      } else {
        var pool_ids = this._config.cognitoUserPoolId;
        if (!Array.isArray(pool_ids)) {
          pool_ids = [pool_ids];
        }
        var no_match = true;
        var payload_pool_id = temp.payload.iss.split('/').pop();
        for (var ii = 0; ii < pool_ids.length; ii++) {
          if (payload_pool_id === pool_ids[ii]) {
            no_match = false;
            cert = `https://cognito-idp.${this._config.region}.amazonaws.com/${payload_pool_id}/.well-known/jwks.json`;
          }
        }
        if (no_match) {
          throw NError.normal('Token does not match the expected source');
        }
      }
      var getKey = (header, callback) => {
        if ((cert+':'+header.kid) in _keys) {
          callback(null, _keys[cert+':'+header.kid]);
        } else {
          jwksClient({ jwksUri: cert }).getSigningKey(header.kid, function(err, key) {
            var store = key.publicKey || key.rsaPublicKey;
            _keys[cert+':'+header.kid] = store;
            callback(null, store);
          });
        }
      };
      jwt.verify(token, getKey, {}, (err, res) => {
        return err ? reject(NError.normal('Token error', { error: err })) : resolve(res);
      });
    }).then(async (response) => {
      if (!r2u(response)) {
        throw NError.normal('Missing Cognito uuid in access token');
      }
      return response;
    });
  }

  async validate(token) {
    var uuid = await this.uuid(token);
    var viewer_id = await this.getViewerID(uuid);
    if (!viewer_id) {
      throw NError.normal('Unknown profile id for Cognito uuid', { uuid: uuid });
    }
    return new Viewer(viewer_id);
  }

  async createUserAccountFromProfile(token, profile_id, data) {
    if (!data) {
      throw NError.normal('Missing data for creating user account');
    }
    var viewer = null;
    try {
      viewer = await this.validate(token);
    } catch (e) {
      var response = await this.user(token);
      var uuid = r2u(response);
      if (uuid) {
        var existing = await this._DB.getObject(new WriteAllViewer(0), profile_id);
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
        if (r2f(response)) {
          old_data.cognito_username = r2f(response);
        }
        var result = await this._DB.modifyObjectData(new WriteAllViewer(0), profile_id, old_data);
        if (result) {
          var viewer = new WriteAllViewer(profile_id);
          await this._DB.createEdge(viewer, this._DB.Constants.getEdgeInstance(this._DB, viewer, {from_id: uuid, to_id: profile_id, type: this._DB.Constants.COGNITO_EDGE}).withDB(this._DB));
          return profile_id;
        }
      }
      throw NError.normal('Error creating object for Cognito uuid', { uuid: uuid });
    }
    if (viewer) {
      throw NError.normal('Profile already exists for Cognito token', { id: viewer.getID() });
    }
  }

  async createUserAccount(token, data) {
    if (!data) {
      throw NError.normal('Missing data for creating user account');
    }
    var viewer = null;
    try {
      viewer = await this.validate(token);
    } catch (e) {
      var response = await this.user(token);
      var uuid = r2u(response);
      if (uuid) {
        data.cognito_uuid = uuid;
        if (r2f(response)) {
          data.cognito_username = r2f(response);
        }
        var object_id = await this._DB.createObject(new WriteAllViewer(0), 0, data);
        if (object_id) {
          var viewer = new WriteAllViewer(object_id);
          await this._DB.createEdge(viewer, this._DB.Constants.getEdgeInstance(viewer, {from_id: uuid, to_id: object_id, type: this._DB.Constants.COGNITO_EDGE}).withDB(this._DB));
          await this._DB.modifyObjectData(viewer, object_id, { creator_id: object_id });
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

module.exports = Cognito;
