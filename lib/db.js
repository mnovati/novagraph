const fs = require('fs');
const mysql = require('mysql2/promise');
const uuidv1 = require('uuid/v1');
const uuidValidate = require('uuid-validate');
const AWS = require('aws-sdk');
const sharp = require('sharp');
const {promisify} = require('util');

const ReadAllViewer = require('../classes/ReadAllViewer.js');
const Constants = require('./constants.js');

const MAX_EDGE = 65535;
const MAX_OBJECT = 65535;

function stringifyObjectValue(value) {
  if (value === undefined || value === null) {
    return null;
  } else if (typeof value === object) {
    return JSON.stringify(object);
  } else {
    return String(value);
  }
}

function validateEdge(edge) {
  return uuidValidate(edge.getFromID()) &&
    uuidValidate(edge.getToID()) &&
    Number.isInteger(edge.getType()) &&
    (edge.getType() >= 0 && edge.getType() <= MAX_EDGE) &&
    (edge.getType() === MAX_EDGE || Constants.Edges[edge.getType()]);
}

function getReverseEdgeType(type) {
  if (type === MAX_EDGE) {
    return null;
  }
  var reverse = Constants.Edges[type].reverse_edge;
  if (reverse === 'self') {
    return type;
  }
  return (Number.isInteger(reverse) && reverse >= 0) ? reverse : null;
}

async function validateEdgeIDs(that, edge) {
  // skip validation for our internal edge used for Cognito
  if (edge.getType() === MAX_EDGE) {
    return true;
  }
  var viewer = new ReadAllViewer(0);
  var objects = await Promise.all([
    that.getObject(viewer, edge.getFromID()),
    that.getObject(viewer, edge.getToID())
  ]);
  var config = Constants.Edges[edge.getType()];
  return objects[0] && objects[1] &&
    (config.from_type.length === 0 || config.from_type.includes(objects[0].getType())) &&
    (config.to_type.length === 0 || config.to_type.includes(objects[1].getType()));
}

async function checkEdgeCreate(that, viewer, edge) {
  if (!validateEdge(edge)) {
    throw new Error('Edge contains invalid or missing properties');
  }
  var is_valid = await validateEdgeIDs(that, edge);
  if (!is_valid) {
    throw new Error('Invalid type of from or to for this edge of type: ' + edge.getType());
  }
  if (!viewer.isWriteAll()) {
    var can_create = await edge.canCreate();
    if (!can_create) {
      throw new Error('Viewer does not have permission to create edge');
    }
  }
}

async function checkEdgeModify(viewer, edge) {
  if (!validateEdge(edge)) {
    throw new Error('Edge contains invalid or missing properties');
  }
  if (!viewer.isWriteAll()) {
    var can_modify = await edge.canModify();
    if (!can_modify) {
      throw new Error('Viewer does not have permission to delete edge');
    }
  }
}

function validateObject(object) {
  return validateObjectPieces(object.getID(), object.getType(), object.getData());
}

function validateObjectPieces(id, type, data) {
  return uuidValidate(id) &&
    Number.isInteger(type) &&
    (type >= 0 && type <= MAX_OBJECT) &&
    data.constructor === Object &&
    Object.keys(data).length > 0;
}

class DB {

  static initS3(config) {
    AWS.config.update({
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
      region: config.region
    });
    this._s3bucket = config.bucket;
  }

  static init(config) {
    this._pool = mysql.createPool(config);
  }

  static async execute(query, values) {
    var connection = null;
    var attempts = 10;
    while (attempts >=0 && connection === null) {
      try {
        connection = await this._pool.getConnection();
      } catch (e) {
        connection = null;
      }
      attempts--;
    }
    if (connection === null) {
      throw new Error('Unable to retrieve valid DB connection');
    }
    var [result, fields] = await connection.execute(query, values);
    connection.release();
    return [result, fields];
  }

  static async getObject(viewer, id) {
    if (!uuidValidate(id)) {
      throw new Error('Invalid object id: ' + id);
    }
    var [rows, _] = await this.execute(
      'SELECT bin2uuid(id) as id, type, data, status, time_created, time_updated '+
      'FROM objects '+
      'WHERE id=uuid2bin(?) AND status=?;',
      [id, Constants.Status.VISIBLE]
    );
    if (!rows || rows.length !== 1) {
      return null;
    }
    var result = rows[0];
    result.id = result.id.toString();
    result.type = parseInt(result.type);
    var object = Constants.getObjectInstance(viewer, result);
    if (viewer.isReadAll()) {
      return object;
    }
    var can_see = await object.canSee();
    return can_see ? object : null;
  }

  static async createObject(viewer, type, data) {
    var uuid = uuidv1();
    if (!validateObjectPieces(uuid, type, data)) {
      throw new Error('Object contains invalid or missing properties');
    }
    if (type === null) {
      throw new Error('Missing type in create object');
    }
    var temp_object = Constants.getObjectInstance(viewer, { id: uuid, type: type, data: data });
    if (!viewer.isWriteAll()) {
      var can_create = await temp_object.canCreate();
      if (!can_create) {
        throw new Error('Viewer does not have permission to create object');
      }
    }

    var [result, _] = await this.execute(
      'INSERT INTO objects (id, type, data, status) VALUES (uuid2bin(?), ?, ?, ?);',
      [uuid, type, JSON.stringify(data), Constants.Status.VISIBLE]
    );

    if (result.affectedRows != 1) {
      return null;
    }

    var indices = Constants.Objects[type]['index'];
    if (indices) {
      var handles = [];
      for (var key in data) {
        if (indices.includes(key)) {
          handles.push(this.insertIndex(type, key, data[key]));
        }
      }
      await Promise.all(handles);
    }

    return uuid;
  }

  static async modifyObject(viewer, object) {
    if (!validateObject(object)) {
      throw new Error('Object contains invalid or missing properties');
    }
    var old_object = await this.getObject(viewer, object.getID());
    if (!old_object) {
      throw new Error('Cannot retrieve current version of object');
    }
    if (!viewer.isWriteAll()) {
      var can_modify = await old_object.canModify();
      if (!can_modify) {
        throw new Error('Viewer does not have permission to update object');
      }
    }

    var [result, _] = await this.execute(
      'UPDATE objects SET data=? WHERE id=uuid2bin(?);',
      [JSON.stringify(object.getData()), object.getID()]
    );

    if (result.affectedRows != 1) {
      return false;
    }

    // inefficent re-indexing, we can just do changed items
    var type = object.getType();
    var indices = Constants.Objects[type]['index'];
    if (indices) {
      var handles = [];
      for (var key in data) {
        if (indices.includes(key)) {
          handles.push(this.deleteIndex(type, key, old_object.getData()[key]));
        }
      }
      await Promise.all(handles);
      handles = [];
      for (var key in data) {
        if (indices.includes(key)) {
          handles.push(this.insertIndex(type, key, object.getData()[key]));
        }
      }
      await Promise.all(handles);
    }

    return true;
  }

  static async deleteObject(viewer, object) {
    if (!validateObject(object)) {
      throw new Error('Object contains invalid or missing properties');
    }
    if (!viewer.isWriteAll()) {
      var can_modify = await object.canModify();
      if (!can_modify) {
        throw new Error('Viewer does not have permission to delete object');
      }
    }

    var [result, _] = await this.execute(
      'UPDATE objects SET status=? WHERE id=uuid2bin(?);',
      [Constants.Status.DELETED, object.getID()]
    );
    return result.affectedRows === 1;
  }

  static async getSingleEdge(viewer, from_id, type, to_id) {
    if (!uuidValidate(from_id)) {
      throw new Error('Invalid object id: ' + from_id);
    }
    if (!uuidValidate(to_id)) {
      throw new Error('Invalid object id: ' + to_id);
    }
    if (type < 0 || type > MAX_EDGE) {
      throw new Error('Invalid edge type: ' + type);
    }
    var [rows, _] = await this.execute(
      'SELECT bin2uuid(from_id) as from_id, type, bin2uuid(to_id) as to_id, data, time_created, time_updated '+
      'FROM edges '+
      'WHERE from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?;',
      [from_id, to_id, type, Constants.Status.VISIBLE]
    );
    if (!rows || rows.length !== 1) {
      return null;
    }
    var result = rows[0];
    result.from_id = result.from_id.toString();
    result.to_id = result.to_id.toString();
    result.type = parseInt(result.type);
    var edge = Constants.getEdgeInstance(viewer, result);
    if (viewer.isReadAll()) {
      return edge;
    }
    var can_see = await edge.canSee();
    return can_see ? edge : null;
  }

  static async getEdge(viewer, id, type) {
    if (!uuidValidate(id)) {
      throw new Error('Invalid object id: ' + id);
    }
    if (type < 0 || type > MAX_EDGE) {
      throw new Error('Invalid edge type: ' + type);
    }
    var [rows, _] = await this.execute(
      'SELECT bin2uuid(from_id) as from_id, type, bin2uuid(to_id) as to_id, data, time_created, time_updated '+
      'FROM edges '+
      'WHERE from_id=uuid2bin(?) AND type=? AND status=?;',
      [id, type, Constants.Status.VISIBLE]
    );
    if (!rows) {
      return null;
    }
    var results = rows;
    var handles = [];
    for(var ii = 0; ii < results.length; ii++) {
      results[ii].from_id = results[ii].from_id.toString();
      results[ii].to_id = results[ii].to_id.toString();
      results[ii].type = parseInt(results[ii].type);
      handles.push((async () => {
        var edge = Constants.getEdgeInstance(viewer, results[ii]);
        if (viewer.isReadAll()) {
          return edge;
        }
        var can_see = await edge.canSee();
        return can_see ? edge : null;
      })());
    }
    results = await Promise.all(handles);
    return results.filter(Boolean);
  }

  static async createEdge(viewer, edge) {
    var reverse_edge_type = getReverseEdgeType(edge.getType());
    if (reverse_edge_type !== null) {
      var r_edge = Constants.getEdgeInstance(viewer, {
        from_id: edge.getToID(),
        type: reverse_edge_type,
        to_id: edge.getFromID(),
        data: edge.getData(),
      });
      await Promise.all([
        checkEdgeCreate(this, viewer, edge),
        checkEdgeCreate(this, viewer, r_edge)
      ]);
      var [result, _] = await this.execute(
        'INSERT INTO edges (from_id, type, to_id, data, status) VALUES ' +
          '(uuid2bin(?), ?, uuid2bin(?), ?, ?),' +
          '(uuid2bin(?), ?, uuid2bin(?), ?, ?);',
        [edge.getFromID(), edge.getType(), edge.getToID(), edge.getData(), Constants.Status.VISIBLE,
         r_edge.getFromID(), r_edge.getType(), r_edge.getToID(), r_edge.getData(), Constants.Status.VISIBLE]
      );
      return result.affectedRows === 2;
    } else {
      await checkEdgeCreate(this, viewer, edge);
      var [result, _] = await this.execute(
        'INSERT INTO edges (from_id, type, to_id, data, status) VALUES (uuid2bin(?), ?, uuid2bin(?), ?, ?);',
        [edge.getFromID(), edge.getType(), edge.getToID(), edge.getData(), Constants.Status.VISIBLE]
      );
      return result.affectedRows === 1;
    }
  }

  static async modifyEdgeData(viewer, edge) {
    var reverse_edge_type = getReverseEdgeType(edge.getType());
    if (reverse_edge_type !== null) {
      var r_edge = Constants.getEdgeInstance(viewer, {
        from_id: edge.getToID(),
        type: reverse_edge_type,
        to_id: edge.getFromID(),
        data: edge.getData(),
      });
      await Promise.all([
        checkEdgeModify(viewer, edge),
        checkEdgeModify(viewer, r_edge)
      ]);
      var [result, _] = await this.execute(
        'UPDATE edges SET data=? WHERE ' +
          '(from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?) OR ' +
          '(from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?);',
        [edge.getData(),
         edge.getFromID(), edge.getToID(), edge.getType(), Constants.Status.VISIBLE,
         r_edge.getFromID(), r_edge.getToID(), r_edge.getType(), Constants.Status.VISIBLE]
      );
      return result.affectedRows === 2;
    } else {
      await checkEdgeModify(viewer, edge);
      var [result, _] = await this.execute(
        'UPDATE edges SET data=? WHERE from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?;',
        [edge.getData(), edge.getFromID(), edge.getToID(), edge.getType(), Constants.Status.VISIBLE]
      );
      return result.affectedRows === 1;
    }
  }

  static async deleteEdge(viewer, edge) {
    var reverse_edge_type = getReverseEdgeType(edge.getType());
    if (reverse_edge_type !== null) {
      var r_edge = Constants.getEdgeInstance(viewer, {
        from_id: edge.getToID(),
        type: reverse_edge_type,
        to_id: edge.getFromID(),
        data: edge.getData(),
      });
      await Promise.all([
        checkEdgeModify(viewer, edge),
        checkEdgeModify(viewer, r_edge)
      ]);
      var [result, _] = await this.execute(
        'UPDATE edges SET status=? WHERE ' +
          '(from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?) OR ' +
          '(from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?);',
        [Constants.Status.DELETED,
         edge.getFromID(), edge.getToID(), edge.getType(), Constants.Status.VISIBLE,
         r_edge.getFromID(), r_edge.getToID(), r_edge.getType(), Constants.Status.VISIBLE]
      );
      return result.affectedRows === 2;
    } else {
      await checkEdgeModify(viewer, edge);
      var [result, _] = await this.execute(
        'UPDATE edges SET status=? WHERE from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?;',
        [Constants.Status.DELETED, edge.getFromID(), edge.getToID(), edge.getType(), Constants.Status.VISIBLE]
      );
      return result.affectedRows === 1;
    }
  }

  static async lookupIndex(type, key, query_value) {
    var value = stringifyObjectValue(query_value);
    if (!value) {
      return null;
    }
    var [rows, _] = await this.execute(
      'SELECT bin2uuid(value) as id FROM indices WHERE key=UNHEX(SHA1(?));',
      [type+':'+key+':'+value]
    );
    if (!rows) {
      return null;
    }
    var result = [];
    for (var ii = 0; ii < rows.length; ii++) {
      result.push(rows[ii].id.toString());
    }
    return result;
  }

  static async insertIndex(object, key) {
    var value = stringifyObjectValue(object.getData()[key]);
    if (!value) {
      return false;
    }
    var [result, _] = await this.execute(
      'INSERT IGNORE INTO indices (key, value) VALUES (UNHEX(SHA1(?)), uuid2bin(?));',
      [object.getType()+':'+key+':'+value, object.getID()]
    );
    return true;
  }

  static async deleteIndex(object, key) {
    var value = stringifyObjectValue(object.getData()[key]);
    if (!value) {
      return false;
    }
    var [result, _] = await this.execute(
      'DELETE FROM indices WHERE key=UNHEX(SHA1(?)) AND value=uuid2bin(?);',
      [object.getType()+':'+key+':'+value, object.getID()]
    );
    return true;
  }

  static async uploadImage(local_path, width, height) {
    var uuid = uuidv1();
    var data = await promisify(fs.readFile)(local_path);
    if (!data) {
      throw new Error('Error processing file');
    }
    var buffer = Buffer.from(data, 'binary');
    await promisify(fs.unlink)(local_path);
    var out = await sharp(buffer)
      .resize(width, height)
      .toFormat('jpeg')
      .toBuffer();
    var s3 = new AWS.S3({ params: { Bucket: this._s3bucket }});
    var result = await s3.putObject({
      Key: uuid,
      Body: out,
      ContentEncoding: 'base64',
      ContentType: 'image/jpeg',
    }).promise();
    if (!result) {
      throw new Error('Error uploading file to storage');
    }
    return uuid;
  }

  static async getSignedS3URL(key) {
    var s3 = new AWS.S3({ params: { Bucket: this._s3bucket }});
    return await s3.getSignedUrl('getObject', {
      Bucket: this._s3bucket,
      Key: key,
      Expires: 604800
    }).promise();
  }
}

DB._pool = null;
DB_s3bucket = null;

module.exports = DB;
