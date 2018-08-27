const fs = require('fs');
const mysql = require('mysql2/promise');
const uuidv1 = require('uuid/v1');
const uuidValidate = require('uuid-validate');
const AWS = require('aws-sdk');
const sharp = require('sharp');
const delay = require('delay');
const phone = require('phone');
const {promisify} = require('util');

const ReadAllViewer = require('../classes/ReadAllViewer.js');
const WriteAllViewer = require('../classes/WriteAllViewer.js');
const Constants = require('./constants.js');

function stringifyObjectValue(value) {
  if (value === undefined || value === null) {
    return null;
  } else if (typeof value === 'object') {
    return JSON.stringify(object);
  } else {
    return String(value);
  }
}

function validateEdge(edge) {
  return uuidValidate(edge.getFromID()) &&
    uuidValidate(edge.getToID()) &&
    Number.isInteger(edge.getType()) &&
    (edge.getType() >= 0 && edge.getType() <= Constants.MAX_EDGE) &&
    Constants.getEdge(edge.getType());
}

function getReverseEdgeType(type) {
  var reverse = Constants.getEdge(type).reverse_edge;
  if (reverse === 'self') {
    return type;
  }
  return (Number.isInteger(reverse) && reverse >= 0) ? reverse : null;
}

async function validateEdgeIDs(that, edge) {
  // skip validation for our internal edge used for Cognito
  if (edge.getType() === Constants.COGNITO_EDGE) {
    return true;
  } else if (edge.getType() === Constants.ROOT_EDGE) {
    var viewer = new ReadAllViewer(0);
    var object = await that.getObject(viewer, edge.getToID());
    return object && Constants.getObject(object.getType()).root_id === edge.getFromID();
  } else {
    var viewer = new ReadAllViewer(0);
    var objects = await Promise.all([
      that.getObject(viewer, edge.getFromID()),
      that.getObject(viewer, edge.getToID())
    ]);
    var config = Constants.getEdge(edge.getType());
    return objects[0] && objects[1] &&
      (config.from_type.length === 0 || config.from_type.includes(objects[0].getType())) &&
      (config.to_type.length === 0 || config.to_type.includes(objects[1].getType()));
  }
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
  var all_viewer = new ReadAllViewer(0);
  var existing = await that.getSingleEdge(all_viewer, edge.getFromID(), edge.getType(), edge.getToID());
  if (existing) {
    throw new Error('Attempting to create an edge that already exists');
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

function validateObjectPieces(id, type, data) {
  return uuidValidate(id) &&
    Number.isInteger(type) &&
    (type >= 0 && type <= Constants.MAX_OBJECT) &&
    data.constructor === Object &&
    Object.keys(data).length > 0;
}

class DB {

  static initAWS(config) {
    AWS.config.update({
      accessKeyId: config.accessKey,
      secretAccessKey: config.secretKey,
      region: config.region
    });
    this._s3bucket = config.bucket;
    this._snsRegion = config.snsRegion || config.region;
  }

  static init(config) {
    this._pool = mysql.createPool(config);
  }

  static async execute(query, values, retry_count) {
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
    try {
      var [result, fields] = await connection.execute(query, values);
      connection.release();
      return [result, fields];
    } catch (e) {
      connection.release();
      if (e.code === 'EPIPE' || e.code === 'ECONNRESET') {
        connection.destroy();
        retry_count = retry_count || 0;
        if (retry_count < 10) {
          return await this.execute(query, values, retry_count + 1);
        } else {
          throw new Error('Database connection reset after several attempts');
        }
      }
      throw e;
    }
  }

  static async getObject(viewer, id) {
    if (!uuidValidate(id)) {
      throw new Error('Invalid object id: ' + id);
    }
    if (viewer.existsCache(id)) {
      return viewer.fromCache(id);
    }
    if (viewer.existsPending(id)) {
      for (var ii = 0; ii < 10000; ii++) {
        await delay(1);
        if (viewer.existsCache(id)) {
          return viewer.fromCache(id);
        }
      }
    }
    viewer.setPending(id);
    var [rows, _] = await this.execute(
      'SELECT bin2uuid(id) as id, type, data, status, time_created, time_updated '+
      'FROM objects '+
      'WHERE id=uuid2bin(?) AND status=?;',
      [id, Constants.Status.VISIBLE]
    );
    if (!rows || rows.length === 0) {
      viewer.deletePending(id);
      viewer.setCache(id, null);
      return null;
    }
    if (rows.length !== 1) {
      viewer.deletePending(id);
      throw new Error('Panic. Duplicated rows for object id');
    }
    var result = rows[0];
    result.id = result.id.toString();
    result.type = parseInt(result.type);
    var object = Constants.getObjectInstance(viewer, result);
    if (!viewer.isReadAll()) {
      var can_see = await object.canSee();
      object = can_see ? object : null;
    }
    viewer.deletePending(id);
    viewer.setCache(id, object);
    return object;
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
      viewer.deleteCache(uuid);
      return null;
    }

    await Promise.all(['index', 'unique_index'].map(async field => {
      await Promise.all((Constants.getObject(type)[field] || []).map(async index => {
        if (index in data) {
          await this.insertIndex(temp_object, index, field === 'unique_index');
        }
      }));
    }));

    var geo_index = Constants.getObject(type).geo_index;
    if (geo_index && (geo_index in data)) {
      await this.insertGeoIndex(temp_object, geo_index);
    }

    var root_id = Constants.getObject(type).root_id;
    if (root_id) {
      var write_all = new WriteAllViewer(0);
      await this.createEdge(
        write_all,
        Constants.getEdgeInstance(write_all, {from_id: root_id, to_id: uuid, type: Constants.ROOT_EDGE})
      );
    }

    viewer.deleteCache(uuid);

    return uuid;
  }

  static async modifyObject(viewer, object) {
    var data = await object.getData();
    if (!validateObjectPieces(object.getID(), object.getType(), data)) {
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

    var old_data = await old_object.getData();
    if (old_object.getType() === 0 && old_data.cognito_uuid) {
      data.cognito_uuid = old_data.cognito_uuid;
    }

    for (var key in old_data) {
      if (!(key in data)) {
        data[key] = old_data[key];
      }
    }

    viewer.deleteCache(object.getID());

    var [result, _] = await this.execute(
      'UPDATE objects SET data=? WHERE id=uuid2bin(?);',
      [JSON.stringify(data), object.getID()]
    );

    if (result.affectedRows != 1) {
      return false;
    }

    // inefficent re-indexing, we can just do changed items
    await Promise.all(['index', 'unique_index'].map(async field => {
      await Promise.all((Constants.getObject(object.getType())[field] || []).map(async index => {
        if (index in data) {
          await this.deleteIndex(old_object, index);
          await this.insertIndex(object, index, field === 'unique_index');
        }
      }));
    }));
    var geo_index = Constants.getObject(object.getType()).geo_index;
    if (geo_index && (geo_index in data)) {
      await this.deleteGeoIndex(object);
      await this.insertGeoIndex(object, geo_index);
    }
    return true;
  }

  static async setObjectStatus(viewer, object, new_status) {
    var data = await object.getData();
    if (!validateObjectPieces(object.getID(), object.getType(), data)) {
      throw new Error('Object contains invalid or missing properties');
    }

    if (!viewer.isWriteAll()) {
      var can_modify = await object.canModify();
      if (!can_modify) {
        throw new Error('Viewer does not have permission to delete object');
      }
    }

    viewer.deleteCache(object.getID());

    var [result, _] = await this.execute(
      'UPDATE objects SET status=? WHERE id=uuid2bin(?);',
      [new_status, object.getID()]
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
    if (type < 0 || type > Constants.MAX_EDGE) {
      throw new Error('Invalid edge type: ' + type);
    }
    var cache_key = from_id+':'+type+':'+to_id;
    if (viewer.existsCache(cache_key)) {
      return viewer.fromCache(cache_key);
    }
    if (viewer.existsPending(cache_key)) {
      for (var ii = 0; ii < 10000; ii++) {
        await delay(1);
        if (viewer.existsCache(cache_key)) {
          return viewer.fromCache(cache_key);
        }
      }
    }
    viewer.setPending(cache_key);
    var [rows, _] = await this.execute(
      'SELECT bin2uuid(from_id) as from_id, type, bin2uuid(to_id) as to_id, data, time_created, time_updated '+
      'FROM edges '+
      'WHERE from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?;',
      [from_id, to_id, type, Constants.Status.VISIBLE]
    );
    if (!rows || rows.length === 0) {
      viewer.deletePending(cache_key);
      viewer.setCache(cache_key, null);
      return null;
    }
    if (rows.length !== 1) {
      viewer.deletePending(cache_key);
      throw new Error('Panic. Duplicated rows for edge');
    }
    var result = rows[0];
    result.from_id = result.from_id.toString();
    result.to_id = result.to_id.toString();
    result.type = parseInt(result.type);
    var edge = Constants.getEdgeInstance(viewer, result);
    if (!viewer.isReadAll()) {
      var can_see = await edge.canSee();
      edge = can_see ? edge : null;
    }
    viewer.deletePending(cache_key);
    viewer.setCache(cache_key, edge);
    return edge;
  }

  static async getEdge(viewer, id, type) {
    if (!uuidValidate(id)) {
      throw new Error('Invalid object id: ' + id);
    }
    if (type < 0 || type > this.MAX_EDGE) {
      throw new Error('Invalid edge type: ' + type);
    }
    var cache_key = id+':'+type;
    if (viewer.existsCache(cache_key)) {
      return viewer.fromCache(cache_key);
    }
    if (viewer.existsPending(cache_key)) {
      for (var ii = 0; ii < 10000; ii++) {
        await delay(1);
        if (viewer.existsCache(cache_key)) {
          return viewer.fromCache(cache_key);
        }
      }
    }
    viewer.setPending(cache_key);
    var [rows, _] = await this.execute(
      'SELECT bin2uuid(from_id) as from_id, type, bin2uuid(to_id) as to_id, data, time_created, time_updated '+
      'FROM edges '+
      'WHERE from_id=uuid2bin(?) AND type=? AND status=?;',
      [id, type, Constants.Status.VISIBLE]
    );
    if (!rows) {
      viewer.deletePending(cache_key);
      viewer.setCache(cache_key, null);
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
    var out = results.filter(Boolean);
    viewer.deletePending(cache_key);
    viewer.setCache(cache_key, out);
    return out;
  }

  static async createEdge(viewer, edge) {
    var reverse_edge_type = getReverseEdgeType(edge.getType());
    if (reverse_edge_type !== null) {
      viewer.deleteCache(edge.getFromID()+':'+edge.getType());
      viewer.deleteCache(edge.getToID()+':'+reverse_edge_type);
      viewer.deleteCache(edge.getFromID()+':'+edge.getType()+':'+edge.getToID());
      viewer.deleteCache(edge.getToID()+':'+reverse_edge_type+':'+edge.getFromID());
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
      viewer.deleteCache(edge.getFromID()+':'+edge.getType());
      viewer.deleteCache(edge.getFromID()+':'+edge.getType()+':'+edge.getToID());
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
      viewer.deleteCache(edge.getFromID()+':'+edge.getType());
      viewer.deleteCache(edge.getToID()+':'+reverse_edge_type);
      viewer.deleteCache(edge.getFromID()+':'+edge.getType()+':'+edge.getToID());
      viewer.deleteCache(edge.getToID()+':'+reverse_edge_type+':'+edge.getFromID());
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
      viewer.deleteCache(edge.getFromID()+':'+edge.getType());
      viewer.deleteCache(edge.getFromID()+':'+edge.getType()+':'+edge.getToID());
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
      viewer.deleteCache(edge.getFromID()+':'+edge.getType());
      viewer.deleteCache(edge.getToID()+':'+reverse_edge_type);
      viewer.deleteCache(edge.getFromID()+':'+edge.getType()+':'+edge.getToID());
      viewer.deleteCache(edge.getToID()+':'+reverse_edge_type+':'+edge.getFromID());
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
      viewer.deleteCache(edge.getFromID()+':'+edge.getType());
      viewer.deleteCache(edge.getFromID()+':'+edge.getType()+':'+edge.getToID());
      await checkEdgeModify(viewer, edge);
      var [result, _] = await this.execute(
        'UPDATE edges SET status=? WHERE from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?;',
        [Constants.Status.DELETED, edge.getFromID(), edge.getToID(), edge.getType(), Constants.Status.VISIBLE]
      );
      return result.affectedRows === 1;
    }
  }

  static async quickChangeStatusAllEdges(viewer, id, new_status, old_status) {
    if (!viewer.isWriteAll()) {
      throw new Error('Viewer cannot perform delete all action');
    }
    var [rows, _] = await this.execute(
      'SELECT bin2uuid(id) as id FROM objects WHERE id=uuid2bin(?) AND status=?;',
      [id, new_status]
    );
    if (!rows || rows.length === 0) {
      throw new Error('Cannot only remove edges from deleted object');
    }
    var [result, _] = await this.execute(
      'UPDATE edges SET status=? WHERE (from_id=uuid2bin(?) OR to_id=uuid2bin(?)) AND status=?;',
      [new_status, id, id, old_status]
    );
  }

  static async rollbackObject(object_id) {
    var rollback_viewer = new WriteAllViewer(0);
    try {
      var object = await this.getObject(rollback_viewer, object_id);
      if (!object) {
        throw new Error('');
      }
      var result = await this.setObjectStatus(rollback_viewer, object, Constants.Status.DELETED);
      if (!result) {
        throw new Error('');
      }
    } catch (e) {
      console.error('ROLLBACK FAILED: ' + object_id);
    }
  }

  static async rollbackEdges(edges) {
    await Promise.all(edges.map(async edge => { return await this.rollbackEdge(edge); }));
  }

  static async rollbackEdge(edge) {
    var rollback_viewer = new WriteAllViewer(0);
    try {
      var result = await this.deleteEdge(rollback_viewer, edge);
      if (!result) {
        throw new Error('');
      }
    } catch (e) {
      console.error('ROLLBACK FAILED: ' + edge.getFromID() + ',' + edge.getToID() + ',' + edge.getType());
    }
  }

  static async lookupIndex(type, key, query_value) {
    var value = stringifyObjectValue(query_value);
    if (!value) {
      return null;
    }
    var [rows, _] = await this.execute(
      'SELECT bin2uuid(`value`) as id FROM indices WHERE `key`=UNHEX(SHA1(?));',
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

  static async insertIndex(object, key, is_unique) {
    var data = await object.getData();
    var value = stringifyObjectValue(data[key]);
    if (!value) {
      return false;
    }
    if (is_unique) {
      var existing = await this.lookupIndex(object.getType(), key, data[key]);
      if (existing && existing.length > 0) {
        return false;
      }
    }
    var [result, _] = await this.execute(
      'INSERT IGNORE INTO indices (`key`, `value`) VALUES (UNHEX(SHA1(?)), uuid2bin(?));',
      [object.getType()+':'+key+':'+value, object.getID()]
    );
    return true;
  }

  static async deleteIndex(object, key) {
    var data = await object.getData();
    var value = stringifyObjectValue(data[key]);
    if (!value) {
      return false;
    }
    var [result, _] = await this.execute(
      'DELETE FROM indices WHERE `key`=UNHEX(SHA1(?)) AND `value`=uuid2bin(?);',
      [object.getType()+':'+key+':'+value, object.getID()]
    );
    return true;
  }

  static async lookupGeoIndex(point, types, distance) {
    if (!point || !point.lat || !point.lng) {
      return null;
    }
    var filler = [];
    types = types.map((t) => parseInt(t)).filter(x => x === 0 || !!x);
    types.forEach((t) => filler.push('?'));
    types.push('POINT ('+point.lng+' '+point.lat+')');
    types.push(distance);
    var [rows, _] = await this.execute(
      'SELECT bin2uuid(`id`) as id '+
      'FROM geoindices '+
      'WHERE `type` IN ('+filler.join(',')+') AND st_distance_sphere(shape, st_geomfromtext(?)) <= ?;',
      types
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

  static async insertGeoIndex(object, key) {
    var data = await object.getData();
    if (!data[key] || !data[key].lat || !data[key].lng) {
      return false;
    }
    var [result, _] = await this.execute(
      'INSERT IGNORE INTO geoindices (`id`, `type`, `shape`) VALUES (uuid2bin(?), ?, st_geomfromtext(?));',
      [object.getID(), object.getType(), 'POINT ('+data[key].lng+' '+data[key].lat+')']
    );
    return true;
  }

  static async deleteGeoIndex(object) {
    var [result, _] = await this.execute(
      'DELETE FROM geoindices WHERE `id`=uuid2bin(?);',
      [object.getID()]
    );
    return true;
  }

  static async uploadFile(local_path) {
    var uuid = uuidv1();
    var data = await promisify(fs.readFile)(local_path);
    if (!data) {
      throw new Error('Error processing file');
    }
    var out = Buffer.from(data, 'binary');
    await promisify(fs.unlink)(local_path);
    var s3 = new AWS.S3({ params: { Bucket: this._s3bucket }});
    var result = await s3.putObject({
      Key: uuid,
      Body: out,
      ContentEncoding: 'base64',
      ContentType: 'application/octet-stream',
    }).promise();
    if (!result) {
      throw new Error('Error uploading file to storage');
    }
    return uuid;
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

  static getSignedS3URL(key) {
    var s3 = new AWS.S3({ params: { Bucket: this._s3bucket }});
    return s3.getSignedUrl('getObject', {
      Bucket: this._s3bucket,
      Key: key,
      Expires: 604800
    });
  }

  static async publishSMS(phone_num, message) {
    var normalized = phone(phone_num);
    normalized = normalized.length > 0 ? normalized[0] : null;
    if (!normalized) {
      return false;
    }
    var sns = new AWS.SNS({
      apiVersion: '2010-03-31',
      region: this._snsRegion
    });
    try {
      var result = await sns.publish({
        Message: message,
        PhoneNumber: normalized
      }).promise();
      if (!result) {
        throw new Error('Error sending SMS message.');
      }
    } catch (e) {
      console.error(e);
      throw new Error('Error sending SMS message.');
    }
    return true;
  }

  static async generateRootID(viewer, name) {
    return await this.createObject(viewer, Constants.ROOT_OBJECT, { name: name });
  }
}

DB._pool = null;
DB._s3bucket = null;
DB._snsRegion = null;

module.exports = DB;
