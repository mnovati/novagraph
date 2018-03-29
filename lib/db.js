const mysql = require('mysql2/promise');
const uuidv1 = require('uuid/v1');
const uuidValidate = require('uuid-validate');

const Constants = require('./constants.js');

const MAX_EDGE = 65535;
const MAX_OBJECT = 65535;

function validateEdge(edge) {
  return uuidValidate(edge.getID1()) &&
    uuidValidate(edge.getID2()) &&
    Number.isInteger(edge.getType()) &&
    (edge.getType() >= 0 && edge.getType() <= MAX_EDGE);
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

  static init(config) {
    this._config = config;
  }

  static async getConnection() {
    if (this.config === null) {
      throw new Error('Missing MySQL configuration, set DB.init');
    }
    if (this._c === null) {
      this._c = await mysql.createConnection(this._config);
    }
    return this._c;
  }

  static async getObject(viewer, id) {
    if (!uuidValidate(id)) {
      throw new Error('Invalid object id');
    }
    var connection = await this.getConnection();
    var [rows, _] = await connection.execute(
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

    var connection = await this.getConnection();
    var [result, error] = await connection.execute(
      'INSERT INTO objects (id, type, data, status) VALUES (uuid2bin(?), ?, ?, ?);',
      [uuid, type, JSON.stringify(data), Constants.Status.VISIBLE]
    );
    return (!error && result.insertId) ? uuid : null;
  }

  static async modifyObject(viewer, object) {
    if (!validateObject(object)) {
      throw new Error('Object contains invalid or missing properties');
    }
    if (!viewer.isWriteAll()) {
      var can_modify = await object.canModify();
      if (!can_modify) {
        throw new Error('Viewer does not have permission to update object');
      }
    }

    var connection = await this.getConnection();
    var [result, error] = await connection.execute(
      'UPDATE objects SET data=? WHERE id=uuid2bin(?);',
      [JSON.stringify(object.getData()), object.getID()]
    );
    return !error && result.affectedRows === 1;
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

    var connection = await this.getConnection();
    var [result, error] = await connection.execute(
      'UPDATE objects SET status=? WHERE id=uuid2bin(?);',
      [Constants.Status.DELETED, object.getID()]
    );
    return !error && result.affectedRows === 1;
  }

  static async getEdge(viewer, id, type) {
    if (!uuidValidate(id) || !(type >= 0 && type <= MAX_EDGE)) {
      throw new Error('Edge contains invalid or missing properties');
    }
    var connection = await this.getConnection();
    var [rows, _] = await connection.execute(
      'SELECT bin2uuid(id1) as id1, type, bin2uuid(id2) as id2, data, time_created, time_updated '+
      'FROM edges '+
      'WHERE id1=uuid2bin(?) AND type=? AND status=?;',
      [id, type, Constants.Status.VISIBLE]
    );
    if (!rows) {
      return null;
    }
    var results = rows;
    var handles = [];
    for(var ii = 0; ii < results.length; ii++) {
      results[ii].id1 = results[ii].id1.toString();
      results[ii].id2 = results[ii].id2.toString();
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
    if (!validateEdge(edge)) {
      throw new Error('Edge contains invalid or missing properties');
    }
    if (edge.getType() === null) {
      throw new Error('Missing type in create edge');
    }
    if (!viewer.isWriteAll()) {
      var can_create = await edge.canCreate();
      if (!can_create) {
        throw new Error('Viewer does not have permission to create edge');
      }
    }

    var connection = await this.getConnection();
    var [result, error] = await connection.execute(
      'INSERT INTO edges (id1, type, id2, data, status) VALUES (uuid2bin(?), ?, uuid2bin(?), ?, ?);',
      [edge.getID1(), edge.getType(), edge.getID2(), edge.getData(), Constants.Status.VISIBLE]
    );
    return !error && result.insertId;
  }

  static async modifyEdge(viewer, edge) {
    if (!validateEdge(edge)) {
      throw new Error('Edge contains invalid or missing properties');
    }
    if (!viewer.isWriteAll()) {
      var can_modify = await edge.canModify();
      if (!can_modify) {
        throw new Error('Viewer does not have permission to update edge');
      }
    }

    var connection = await this.getConnection();
    var [result, error] = await connection.execute(
      'UPDATE edges SET data=? WHERE id1=uuid2bin(?) AND id2=uuid2bin(?) AND type=?;',
      [edge.getData(), edge.getID1(), edge.getID2(), edge.getType()]
    );
    return !error && result.affectedRows === 1;
  }

  static async deleteEdge(viewer, edge) {
    if (!validateEdge(edge)) {
      throw new Error('Edge contains invalid or missing properties');
    }
    if (!viewer.isWriteAll()) {
      var can_modify = await edge.canModify();
      if (!can_modify) {
        throw new Error('Viewer does not have permission to delete edge');
      }
    }

    var connection = await this.getConnection();
    var [result, error] = await connection.execute(
      'UPDATE edges SET status=? WHERE id1=uuid2bin(?) AND id2=uuid2bin(?) AND type=?;',
      [Constants.Status.DELETED, edge.getID1(), edge.getID2(), edge.getType()]
    );
    return !error && result.affectedRows === 1;
  }
}

DB._c = null;

DB._config = null;

module.exports = DB;
