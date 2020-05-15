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
const NError = require('./error.js');

function stringifyObjectValue(value) {
  if (value === undefined || value === null) {
    return null;
  } else if (typeof value === 'object') {
    return JSON.stringify(value);
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

async function checkObjectTypes(viewer, object) {
  var config = Constants.getObject(object.getType());
  var types = config.types || {};
  var data = object.object.data;
  for (var type in types) {
    if (type in data) {
      var result = await types[type].check(viewer, data[type]);
      if (!result) {
        throw NError.critical('Object invalid type for field', { id: object.getID(), field: type, value: data[type] });
      }
      object.object.data[type] = await types[type].normalize(data[type]);
    }
  }
  if (config.strict_types) {
    for (var key in data) {
      if (!(key in types)) {
        throw NError.critical('Object unexpected key in data present', { id: object.getID(), field: key });
      }
    }
  }
  return object;
}

async function checkEdgeCreate(that, viewer, edge) {
  if (!validateEdge(edge)) {
    throw NError.normal('Edge contains invalid or missing properties');
  }
  var all_viewer = new ReadAllViewer(0);
  if (edge.getType() === Constants.COGNITO_EDGE) {
    // skip validation for our internal edge used for Cognito
  } else if (edge.getType() === Constants.ROOT_EDGE) {
    var object = await that.getObject(all_viewer, edge.getToID());
    if (!object || Constants.getObject(object.getType()).root_id !== edge.getFromID()) {
      throw NError.normal('Cannot make a root edge where the from id is not a root id');
    }
  } else {
    var objects = await Promise.all([
      that.getObject(all_viewer, edge.getFromID()),
      that.getObject(all_viewer, edge.getToID())
    ]);
    var config = Constants.getEdge(edge.getType());
    if (!objects[0]) {
      throw NError.normal('Cannot load from type for edge', { id: edge.getFromID(), type: edge.getType() });
    }
    if (!objects[1]) {
      throw NError.normal('Cannot load to type for edge', { id: edge.getToID(), type: edge.getType() });
    }
    if (config.from_type.length > 0 && !config.from_type.includes(objects[0].getType())) {
      throw NError.normal('Invalid from type for edge', { id: edge.getFromID(), from_type: objects[0].getType(), type: edge.getType() });
    }
    if (config.to_type.length > 0 && !config.to_type.includes(objects[1].getType())) {
      throw NError.normal('Invalid to type for edge', { id: edge.getToID(), from_type: objects[1].getType(), type: edge.getType() });
    }
  }
  if (!viewer.isWriteAll()) {
    var can_create = await edge.canCreate();
    if (!can_create) {
      throw NError.normal('Viewer does not have permission to create edge');
    }
  }
  var existing = await that.getSingleEdge(all_viewer, edge.getFromID(), edge.getType(), edge.getToID());
  if (existing) {
    throw NError.normal('Attempting to create an edge that already exists');
  }
}

async function checkEdgeModify(viewer, edge) {
  if (!validateEdge(edge)) {
    throw NError.normal('Edge contains invalid or missing properties');
  }
  if (!viewer.isWriteAll()) {
    var can_modify = await edge.canModify();
    if (!can_modify) {
      throw NError.normal('Viewer does not have permission to delete edge');
    }
  }
}

function validateAndThrowObjectPieces(id, type, data) {
  if (!uuidValidate(id)) {
    throw NError.normal('Invalid id provided, expecting a uuid');
  }
  if (!Number.isInteger(type) || type < 0 || type >= Constants.MAX_OBJECT) {
    throw NError.normal('Invalid or unknown object type provided');
  }
  if (!data) {
    throw NError.normal('Missing or null data provided');
  }
  if (data.constructor !== Object) {
    throw NError.normal('Format of data was unexpected, json required');
  }
  if (Object.keys(data).length === 0) {
    throw NError.normal('Cannot mutate an object using an empty data object');
  }
}

class MySQLWrapper {

  constructor(config) {
    this._pool = mysql.createPool(config);
  }

  async execute(query, values, retry_count) {
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
      throw NError.normal('Unable to retrieve valid DB connection');
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
          throw NError.normal('Database connection reset after several attempts');
        }
      }
      throw e;
    }
  }

  async end() {
    await this._pool.end();
  }
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
    var _config;
    if ('client' in config) {
      _config = config;
    } else {
      _config = {
        client: 'mysql',
        connection: config,
      };
    }
    switch (_config.client) {
      case 'mysql':
        this._wrap = new MySQLWrapper(_config.connection);
        break;
      default:
        throw NError.normal('Unknown database type', { client: _config.client });
    }
  }

  static async end() {
    this._wrap && this._wrap.end();
  }

  static async execute(query, values, retry_count) {
    query = query.trim();
    if (!query.endsWith(';')) {
      query += ';';
    }
    return await this._wrap.execute(query, values, retry_count);
  }

  static async getObject(viewer, id) {
    if (!id) {
      throw NError.normal('Missing object id');
    }
    if (!uuidValidate(id)) {
      throw NError.normal('Invalid object id', { id: id });
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
    viewer._incrQueryCount();
    var [rows, _] = await this.execute(`
        SELECT bin2uuid(id) as id, type, data, status, time_created, time_updated
        FROM objects
        WHERE id=uuid2bin(?) AND status=?
      `, [id, Constants.Status.VISIBLE]
    );
    if (!rows || rows.length === 0) {
      viewer.deletePending(id);
      viewer.setCache(id, null);
      return null;
    }
    if (rows.length !== 1) {
      viewer.deletePending(id);
      throw NError.normal('Panic. Duplicated rows for object id');
    }
    var result = rows[0];
    result.id = result.id.toString();
    result.type = parseInt(result.type);
    var object = Constants.getObjectInstance(viewer, result);
    if (!viewer.isReadAll()) {
      var can_see = await object.canSee();
      if (can_see) {
        var data = Object.assign({}, result.data);
        await Promise.all(Object.keys(data).map(async key => {
          var can = await object.canSeeField(key);
          if (!can) {
            delete data[key];
          }
        }));
        result.data = data;
        object = Constants.getObjectInstance(viewer, result);
      } else {
        object = null;
      }
    }
    viewer.deletePending(id);
    viewer.setCache(id, object);
    return object;
  }

  static async createObject(viewer, type, data) {
    var uuid = uuidv1();
    validateAndThrowObjectPieces(uuid, type, data);
    if (type === null) {
      throw NError.normal('Missing type in create object');
    }
    var temp_object = Constants.getObjectInstance(viewer, { id: uuid, type: type, data: data });
    if (!viewer.isWriteAll()) {
      var can_create = await temp_object.canCreate();
      if (!can_create) {
        throw NError.normal('Viewer does not have permission to create object');
      }
      await Promise.all(Object.keys(data).map(async key => {
        var can = await temp_object.canCreateField(key);
        if (!can) {
          delete data[key];
        }
      }));
      temp_object = Constants.getObjectInstance(viewer, { id: uuid, type: type, data: data });
    }

    temp_object = await checkObjectTypes(viewer, temp_object);

    // check duplicated unique indexes
    await Promise.all((Constants.getObject(type).unique_index || []).map(async index => {
      if (index in data) {
        var existing = await this.lookupIndex(type, index, data[index]);
        if (existing && existing.length > 0) {
          throw NError.normal('Duplicate index entry attempted', { id: uuid, type: type, field: index, value: data[index] });
        }
      }
    }));

    viewer._incrQueryCount();
    var [result, _] = await this.execute(`
        INSERT INTO objects (id, type, data, status) VALUES (uuid2bin(?), ?, ?, ?)
      `, [uuid, type, JSON.stringify(data), Constants.Status.VISIBLE]
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

    await Promise.all((Constants.getObject(type)['time_index'] || []).map(async index => {
      if ((index in data) || index.startsWith('object.')) {
        await this.insertTimeIndex(temp_object, index);
      }
    }));

    var geo_index = Constants.getObject(type).geo_index;
    if (geo_index && (geo_index in data)) {
      await this.insertGeoIndex(temp_object, geo_index);
    }

    await this.updateTextIndex(uuid, type, data, {});

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
    validateAndThrowObjectPieces(object.getID(), object.getType(), data);

    var old_object = await this.getObject(viewer, object.getID());
    if (!old_object) {
      throw NError.normal('Cannot retrieve current version of object');
    }
    if (!viewer.isWriteAll()) {
      var can_modify = await old_object.canModify();
      if (!can_modify) {
        throw NError.normal('Viewer does not have permission to update object');
      }
    }

    object = await checkObjectTypes(viewer, object);

    if (!viewer.isWriteAll()) {
      await Promise.all(Object.keys(data).map(async key => {
        var can = await old_object.canModifyField(key);
        if (!can) {
          delete data[key];
        }
      }));
    }

    // pull raw data on old object instead of calling getData
    data = Object.assign({}, data);
    var master = await this.getObject(viewer.getReadAllViewer(), object.getID());
    var old_data = master.object.data;
    if (old_object.getType() === 0 && old_data.cognito_uuid) {
      data.cognito_uuid = old_data.cognito_uuid;
    }
    if (old_object.getType() === 0 && old_data.cognito_username) {
      data.cognito_username = old_data.cognito_username;
    }

    for (var key in old_data) {
      if (!(key in data)) {
        data[key] = old_data[key];
      }
    }

    viewer.deleteCache(object.getID());

    // check duplicated unique indexes
    await Promise.all((Constants.getObject(object.getType()).unique_index || []).map(async index => {
      if (index in data) {
        if (stringifyObjectValue(data[index]) !== stringifyObjectValue(old_data[index])) {
          var existing = await this.lookupIndex(object.getType(), index, data[index]);
          if (existing &&
              existing.length > 0 &&
              !(existing.length === 1 && existing[0] === object.getID())) {
            throw NError.normal('Duplicate index entry attempted', { id: object.getID(), type: object.getType(), field: index, value: data[index] });
          }
        }
      }
    }));

    viewer._incrQueryCount();
    var [result, _] = await this.execute(`
        UPDATE objects SET data=? WHERE id=uuid2bin(?)
      `, [JSON.stringify(data), object.getID()]
    );

    if (result.affectedRows != 1) {
      return false;
    }

    await Promise.all(['index', 'unique_index'].map(async field => {
      await Promise.all((Constants.getObject(object.getType())[field] || []).map(async index => {
        if (index in data) {
          if (Array.isArray(data[index]) ||
              (!Array.isArray(data[index]) && stringifyObjectValue(data[index]) !== stringifyObjectValue(old_data[index]))) {
            await this.deleteIndex(old_object, index);
            await this.insertIndex(object, index, field === 'unique_index');
          }
        }
      }));
    }));

    await Promise.all((Constants.getObject(type)['time_index'] || []).map(async index => {
      if ((index in data) && data[index] !== old_data[index]) {
        await this.insertTimeIndex(object, index);
      } else if (index === 'object.time_updated') {
        await this.insertTimeIndex(object, index);
      }
    }));

    var geo_index = Constants.getObject(object.getType()).geo_index;
    if (geo_index && geo_index in data && stringifyObjectValue(data[geo_index]) !== stringifyObjectValue(old_data[geo_index])) {
      await this.deleteGeoIndex(object);
      await this.insertGeoIndex(object, geo_index);
    }
    await this.updateTextIndex(object.getID(), object.getType(), data, old_data);

    return true;
  }

  static async setObjectStatus(viewer, object, new_status) {
    var data = await object.getData();
    validateAndThrowObjectPieces(object.getID(), object.getType(), data);

    if (!viewer.isWriteAll()) {
      var can_modify = await object.canModify();
      if (!can_modify) {
        throw NError.normal('Viewer does not have permission to delete object');
      }
    }

    // remove index entries upon delete
    if (new_status !== Constants.Status.VISIBLE) {
      await Promise.all(['index', 'unique_index'].map(async field => {
        await Promise.all((Constants.getObject(object.getType())[field] || []).map(async index => {
          if (index in data) {
            await this.deleteIndex(object, index);
          }
        }));
      }));
      var geo_index = Constants.getObject(object.getType()).geo_index;
      if (geo_index && (geo_index in data)) {
        await this.deleteGeoIndex(object);
      }
      await this.deleteTextIndex(object);
      await this.deleteTimeIndex(object);
    }

    viewer.deleteCache(object.getID());

    viewer._incrQueryCount();
    var [result, _] = await this.execute(`
        UPDATE objects SET status=? WHERE id=uuid2bin(?)
      `, [new_status, object.getID()]
    );
    return result.affectedRows === 1;
  }

  static async getSingleEdge(viewer, from_id, type, to_id) {
    if (!uuidValidate(from_id)) {
      throw NError.normal('Invalid object id', { id: from_id });
    }
    if (!uuidValidate(to_id)) {
      throw NError.normal('Invalid object id', { id: to_id });
    }
    if (type < 0 || type > Constants.MAX_EDGE) {
      throw NError.normal('Invalid edge type', { type: type });
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
    viewer._incrQueryCount();
    var [rows, _] = await this.execute(`
        SELECT bin2uuid(from_id) as from_id, type, bin2uuid(to_id) as to_id, data, time_created, time_updated
        FROM edges
        WHERE from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?
      `, [from_id, to_id, type, Constants.Status.VISIBLE]
    );
    if (!rows || rows.length === 0) {
      viewer.deletePending(cache_key);
      viewer.setCache(cache_key, null);
      return null;
    }
    if (rows.length !== 1) {
      viewer.deletePending(cache_key);
      throw NError.normal('Panic. Duplicated rows for edge');
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
      throw NError.normal('Invalid object id', { id: id });
    }
    if (type < 0 || type > this.MAX_EDGE) {
      throw NError.normal('Invalid edge type', { type: type });
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
    viewer._incrQueryCount();
    var [rows, _] = await this.execute(`
        SELECT bin2uuid(from_id) as from_id, type, bin2uuid(to_id) as to_id, data, time_created, time_updated
        FROM edges
        WHERE from_id=uuid2bin(?) AND type=? AND status=?
      `, [id, type, Constants.Status.VISIBLE]
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
      viewer._incrQueryCount();
      var [rows, _] = await this.execute(`
          SELECT * FROM edges
          WHERE (from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?) or
            (from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?)
        `, [edge.getFromID(), edge.getToID(), edge.getType(), Constants.Status.VISIBLE,
            r_edge.getFromID(), r_edge.getToID(), r_edge.getType(), Constants.Status.VISIBLE]
      );
      if (rows && rows.length > 0) {
        return false;
      }
      var [result, _] = await this.execute(`
          INSERT INTO edges (from_id, type, to_id, data, status) VALUES
          (uuid2bin(?), ?, uuid2bin(?), ?, ?),
          (uuid2bin(?), ?, uuid2bin(?), ?, ?)
        `, [edge.getFromID(), edge.getType(), edge.getToID(), edge.getData(), Constants.Status.VISIBLE,
         r_edge.getFromID(), r_edge.getType(), r_edge.getToID(), r_edge.getData(), Constants.Status.VISIBLE]
      );
      return result.affectedRows === 2;
    } else {
      viewer.deleteCache(edge.getFromID()+':'+edge.getType());
      viewer.deleteCache(edge.getFromID()+':'+edge.getType()+':'+edge.getToID());
      await checkEdgeCreate(this, viewer, edge);
      viewer._incrQueryCount();
      var [rows, _] = await this.execute(`
          SELECT * FROM edges
          WHERE from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?
        `, [edge.getFromID(), edge.getToID(), edge.getType(), Constants.Status.VISIBLE]
      );
      if (rows && rows.length > 0) {
        return false;
      }
      var [result, _] = await this.execute(`
          INSERT INTO edges (from_id, type, to_id, data, status) VALUES (uuid2bin(?), ?, uuid2bin(?), ?, ?)
        `, [edge.getFromID(), edge.getType(), edge.getToID(), edge.getData(), Constants.Status.VISIBLE]
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
      viewer._incrQueryCount();
      var [result, _] = await this.execute(`
          UPDATE edges SET data=? WHERE
          (from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?) OR
          (from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?)
        `, [edge.getData(), edge.getFromID(), edge.getToID(), edge.getType(), Constants.Status.VISIBLE,
         r_edge.getFromID(), r_edge.getToID(), r_edge.getType(), Constants.Status.VISIBLE]
      );
      return result.affectedRows === 2;
    } else {
      viewer.deleteCache(edge.getFromID()+':'+edge.getType());
      viewer.deleteCache(edge.getFromID()+':'+edge.getType()+':'+edge.getToID());
      await checkEdgeModify(viewer, edge);
      viewer._incrQueryCount();
      var [result, _] = await this.execute(`
          UPDATE edges SET data=? WHERE from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?
        `, [edge.getData(), edge.getFromID(), edge.getToID(), edge.getType(), Constants.Status.VISIBLE]
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
      viewer._incrQueryCount();
      var [result, _] = await this.execute(`
          UPDATE edges SET status=? WHERE
          (from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?) OR
          (from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?)
        `, [Constants.Status.DELETED, edge.getFromID(), edge.getToID(), edge.getType(), Constants.Status.VISIBLE,
         r_edge.getFromID(), r_edge.getToID(), r_edge.getType(), Constants.Status.VISIBLE]
      );
      return result.affectedRows === 2;
    } else {
      viewer.deleteCache(edge.getFromID()+':'+edge.getType());
      viewer.deleteCache(edge.getFromID()+':'+edge.getType()+':'+edge.getToID());
      await checkEdgeModify(viewer, edge);
      viewer._incrQueryCount();
      var [result, _] = await this.execute(`
          UPDATE edges SET status=? WHERE from_id=uuid2bin(?) AND to_id=uuid2bin(?) AND type=? AND status=?
        `, [Constants.Status.DELETED, edge.getFromID(), edge.getToID(), edge.getType(), Constants.Status.VISIBLE]
      );
      return result.affectedRows === 1;
    }
  }

  static async quickChangeStatusAllEdges(viewer, id, new_status, old_status) {
    if (!viewer.isWriteAll()) {
      throw NError.normal('Viewer cannot perform delete all action');
    }
    viewer._incrQueryCount();
    var [rows, _] = await this.execute(`
        SELECT bin2uuid(id) as id FROM objects WHERE id=uuid2bin(?) AND status=?
      `, [id, new_status]
    );
    if (!rows || rows.length === 0) {
      throw NError.normal('Cannot only remove edges from deleted object');
    }
    viewer._incrQueryCount();
    var [result, _] = await this.execute(`
        UPDATE edges SET status=? WHERE (from_id=uuid2bin(?) OR to_id=uuid2bin(?)) AND status=?
      `, [new_status, id, id, old_status]
    );
  }

  static async rollbackObject(object_id) {
    var rollback_viewer = new WriteAllViewer(0);
    try {
      var object = await this.getObject(rollback_viewer, object_id);
      if (!object) {
        throw NError.normal('Cannot load object');
      }
      var result = await this.setObjectStatus(rollback_viewer, object, Constants.Status.DELETED);
      if (!result) {
        throw NError.normal('Cannot delete object');
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
        throw NError.normal('Cannot delete edge');
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
    var [rows, _] = await this.execute(`
       SELECT bin2uuid(\`value\`) as id FROM indices WHERE \`key\`=UNHEX(SHA1(?))
      `, [type+':'+key+':'+value]
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
    var starting = data[key];
    var values = [];
    if (Array.isArray(starting)) {
      starting.forEach(v => values.push(v));
    } else {
      values.push(starting);
    }
    await Promise.all(values.map(async raw_value => {
      var value = stringifyObjectValue(raw_value);
      if (!value) {
        return false;
      }
      if (is_unique) {
        var existing = await this.lookupIndex(object.getType(), key, data[key]);
        if (existing && existing.length > 0) {
          return false;
        }
      }
      var [result, _] = await this.execute(`
          INSERT IGNORE INTO indices (\`key\`, \`value\`) VALUES (UNHEX(SHA1(?)), uuid2bin(?))
        `, [object.getType()+':'+key+':'+value, object.getID()]
      );
    }));
    return true;
  }

  static async deleteIndex(object, key) {
    var data = await object.getData();
    var starting = data[key];
    var values = [];
    if (Array.isArray(starting)) {
      starting.forEach(v => values.push(v));
    } else {
      values.push(starting);
    }
    await Promise.all(values.map(async raw_value => {
      var value = stringifyObjectValue(raw_value);
      if (!value) {
        return false;
      }
      var [result, _] = await this.execute(`
          DELETE FROM indices WHERE \`key\`=UNHEX(SHA1(?)) AND \`value\`=uuid2bin(?)
        `, [object.getType()+':'+key+':'+value, object.getID()]
      );
    }));
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
    var [rows, _] = await this.execute(`
        SELECT bin2uuid(id) as id
        FROM geoindices
        WHERE type IN (${filler.join(',')}) AND st_distance_sphere(shape, st_geomfromtext(?)) <= ?
      `, types
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
    var [result, _] = await this.execute(`
        INSERT IGNORE INTO geoindices (id, type, shape) VALUES (uuid2bin(?), ?, st_geomfromtext(?))
      `, [object.getID(), object.getType(), 'POINT ('+data[key].lng+' '+data[key].lat+')']
    );
    return true;
  }

  static async deleteGeoIndex(object) {
    var [result, _] = await this.execute(`
        DELETE FROM geoindices WHERE id=uuid2bin(?)
      `, [object.getID()]
    );
    return true;
  }

  static async lookupTimeIndex(type, field, start_date, end_date) {
    var start_value = null;
    var end_value = null;
    try {
      start_value = new Date(start_date);
      if (end_date) {
        end_value = new Date(end_date);
      }
    } catch (e) {}
    var rows = null;
    if (start_value && end_value) {
      var [_rows, _] = await this.execute(`
         SELECT bin2uuid(\`id\`) as id FROM dateindices WHERE \`type\`=? and \`field\`=? and \`time_index\` >= CAST(? AS DATETIME) and \`time_index\` <= CAST(? AS DATETIME)
        `, [type, field, start_value.toISOString(), end_value.toISOString()]
      );
      rows = _rows;
    } else if (start_value) {
      var [_rows, _] = await this.execute(`
         SELECT bin2uuid(\`id\`) as id FROM dateindices WHERE \`type\`=? and \`field\`=? and \`time_index\`=CAST(? AS DATETIME)
        `, [type, field, start_value.toISOString()]
      );
      rows = _rows;
    }
    if (!rows) {
      return null;
    }
    var result = [];
    for (var ii = 0; ii < rows.length; ii++) {
      result.push(rows[ii].id.toString());
    }
    return result;
  }

  static async insertTimeIndex(object, key) {
    var data = await object.getData();
    var value = null;
    try {
      value = new Date(key.startsWith('object.') ? object.object[key.split('.')[1]] : data[key]);
    } catch (e) {}
    if (!value) {
      return false;
    }
    var [result, _] = await this.execute(`
        INSERT INTO dateindices (id, type, field, index_time) VALUES (uuid2bin(?), ?, ?, CAST(? AS DATETIME)) ON DUPLICATE KEY UPDATE index_time=CAST(? AS DATETIME)
      `, [object.getID(), object.getType(), key, value.toISOString(), value.toISOString()]
    );
    return true;
  }

  static async deleteTimeIndex(object {
    var [result, _] = await this.execute(`
        DELETE FROM dateindices WHERE id=uuid2bin(?)
      `, [object.getID()]
    );
    return true;
  }


  static async lookupTextIndex(index_type, text) {
    var value = stringifyObjectValue(text);
    if (!value) {
      return null;
    }
    var expression = '(';
    value.split(' ').forEach(w => expression = expression + w + '* ');
    expression = expression + ') ('+ value + ')';
    var [rows, _] = await this.execute(`
        SELECT bin2uuid(id) as id, MATCH(data) AGAINST(? IN BOOLEAN MODE) as score FROM ftsindices
        WHERE type=? and MATCH(data) AGAINST(? IN BOOLEAN MODE) > 0
        ORDER BY score DESC
      `, [expression, index_type, expression]
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

  static async updateTextIndex(id, type, object_data, old_object_data) {
    var indices = Constants.getObject(type).text_index || {};
    for (var index_type in indices) {
      var data = '';
      var old_data = '';
      indices[index_type].forEach(key => {
        data = data + stringifyObjectValue(object_data[key]) + ' ';
        if (key in old_object_data) {
          old_data = old_data + stringifyObjectValue(old_object_data[key]) + ' ';
        }
      });
      if (data !== old_data) {
        var [result, _] = await this.execute(`
            INSERT INTO ftsindices (id, type, data) VALUES (uuid2bin(?), ?, ?) ON DUPLICATE KEY UPDATE data=?
          `, [id, index_type, data, data]
        );
      }
    }
    return true;
  }

  static async deleteTextIndex(object) {
    var indices = Constants.getObject(object.getType()).text_index || {};
    for (var index_type in indices) {
      var [result, _] = await this.execute(`
          DELETE FROM ftsindices WHERE id=uuid2bin(?) and type=?
        `, [object.getID(), index_type]
      );
    }
    return true;
  }

  static async getDeferIndex(type, after, limit) {
    var [rows, _] = await this.execute(`
        SELECT bin2uuid(id) as id FROM deferindices
        WHERE type=? and defer_time <= ?
        LIMIT ?
      `, [type, new Date(after).toISOString().slice(0, 19).replace('T', ' '), limit]
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

  static async insertDeferIndex(id, type, time) {
    var [result, _] = await this.execute(`
        INSERT IGNORE INTO deferindices (id, type, defer_time) VALUES (uuid2bin(?), ?, ?)
      `, [id, type, new Date(time).toISOString().slice(0, 19).replace('T', ' ')]
    );
    return true;
  }

  static async deleteDeferIndex(id, type) {
    var [result, _] = await this.execute(`
        DELETE FROM deferindices WHERE id=uuid2bin(?) and type=?
      `, [id, type]
    );
    return true;
  }

  static async uploadFile(local_path, file_name) {
    var uuid = uuidv1();
    var data = await promisify(fs.readFile)(local_path);
    if (!data) {
      throw NError.normal('Error processing file');
    }
    var out = Buffer.from(data, 'binary');
    var s3 = new AWS.S3({ params: { Bucket: this._s3bucket }});
    var meta = {
      Key: uuid,
      Body: out,
      ContentEncoding: 'base64',
      ContentType: 'application/octet-stream',
    };
    if (file_name) {
      meta.ContentDisposition = 'attachment;filename=' + file_name;
    }
    var result = await s3.putObject(meta).promise();
    if (!result) {
      throw NError.normal('Error uploading file to storage');
    }
    return uuid;
  }

  static async uploadImage(local_path, width, height) {
    var uuid = uuidv1();
    var data = await promisify(fs.readFile)(local_path);
    if (!data) {
      throw NError.normal('Error processing file');
    }
    var buffer = Buffer.from(data, 'binary');
    var out = await sharp(buffer)
      .resize(width, height)
      .png()
      .toBuffer();
    var s3 = new AWS.S3({ params: { Bucket: this._s3bucket }});
    var result = await s3.putObject({
      Key: uuid,
      Body: out,
      ContentEncoding: 'base64',
      ContentType: 'image/png',
    }).promise();
    if (!result) {
      throw NError.normal('Error uploading file to storage');
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
        throw NError.normal('Error sending SMS message.');
      }
    } catch (e) {
      console.error(e);
      throw NError.normal('Error sending SMS message.');
    }
    return true;
  }

  static async generateRootID(viewer, name) {
    return await this.createObject(viewer, Constants.ROOT_OBJECT, { name: name });
  }
}

DB._wrap = null;
DB._s3bucket = null;
DB._snsRegion = null;

module.exports = DB;
