const mysql = require('mysql2/promise');
const uuidv1 = require('uuid/v1');
const uuidValidate = require('uuid-validate');

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
  return uuidValidate(edge.getID1()) &&
    uuidValidate(edge.getID2()) &&
    Number.isInteger(edge.getType()) &&
    (edge.getType() >= 0 && edge.getType() <= MAX_EDGE) &&
    (edge.getType() === MAX_EDGE || Constants.Edges[edge.getType()]);
}

function getReverseEdgeType(type) {
  if (type === MAX_EDGE) {
    return null;
  }
  var reverse = Constants.Edges[edge.getType()].reverse_edge;
  return (Number.isInteger(reverse) && reverse >= 0) ? reverse : null;
}

async function validateEdgeIDs(that, edge) {
  // skip validation for our internal edge used for Cognito
  if (edge.getType() === MAX_EDGE) {
    return true;
  }
  var viewer = new ReadAllViewer(0);
  var objects = await Promise.all([
    that.getObject(viewer, edge.getID1()),
    that.getObject(viewer, edge.getID2())
  ]);
  var config = Constants.Edges[edge.getType()];
  return objects[0] && objects[1] &&
    (config.id1_type.length === 0 || config.id1_type.includes(objects[0].getType())) &&
    (config.id2_type.length === 0 || config.id2_type.includes(objects[1].getType()));
}

async function checkEdgeCreate(that, viewer, edge) {
  if (!validateEdge(edge)) {
    throw new Error('Edge contains invalid or missing properties');
  }
  var is_valid = await validateEdgeIDs(that, edge);
  if (!is_valid) {
    throw new Error('Invalid type of id1 or id2 for this edge of type: ' + edge.getType());
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
    var [result, error] = await connection.execute(query, values);
    connection.release();
    return [result, error];
  }

  static async getObject(viewer, id) {
    if (!uuidValidate(id)) {
      throw new Error('Invalid object id: ' + id);
    }
    var [rows, error] = await this.execute(
      'SELECT bin2uuid(id) as id, type, data, status, time_created, time_updated '+
      'FROM objects '+
      'WHERE id=uuid2bin(?) AND status=?;',
      [id, Constants.Status.VISIBLE]
    );
    if (error || !rows || rows.length !== 1) {
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

    var [result, error] = await this.execute(
      'INSERT INTO objects (id, type, data, status) VALUES (uuid2bin(?), ?, ?, ?);',
      [uuid, type, JSON.stringify(data), Constants.Status.VISIBLE]
    );

    if (error || result.affectedRows != 1) {
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
    if (!viewer.isWriteAll()) {
      var can_modify = await object.canModify();
      if (!can_modify) {
        throw new Error('Viewer does not have permission to update object');
      }
    }

    var old_object = await this.getObject(viewer, object.getID());

    var [result, error] = await this.execute(
      'UPDATE objects SET data=? WHERE id=uuid2bin(?);',
      [JSON.stringify(object.getData()), object.getID()]
    );

    if (error || result.affectedRows != 1) {
      return false;
    }

    // inefficent re-indexing, we can just do changed items
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

    var [result, error] = await this.execute(
      'UPDATE objects SET status=? WHERE id=uuid2bin(?);',
      [Constants.Status.DELETED, object.getID()]
    );
    return !error && (result.affectedRows === 1);
  }

  static async getSingleEdge(viewer, id1, type, id2) {
    if (!uuidValidate(id1)) {
      throw new Error('Invalid object id: ' + id1);
    }
    if (!uuidValidate(id2)) {
      throw new Error('Invalid object id: ' + id2);
    }
    if (type < 0 || type > MAX_EDGE) {
      throw new Error('Invalid edge type: ' + type);
    }
    var [rows, _] = await this.execute(
      'SELECT bin2uuid(id1) as id1, type, bin2uuid(id2) as id2, data, time_created, time_updated '+
      'FROM edges '+
      'WHERE id1=uuid2bin(?) AND id2=uuid2bin(?) AND type=? AND status=?;',
      [id1, id2, type, Constants.Status.VISIBLE]
    );
    if (!rows || rows.length !== 1) {
      return null;
    }
    var result = rows[0];
    result.id1 = result.id1.toString();
    result.id2 = result.id2.toString();
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
    var reverse_edge_type = getReverseEdgeType(edge.getType());
    if (reverse_edge_type !== null) {
      var r_edge = Constants.getEdgeInstance(viewer, {
        id1: edge.getID2(),
        type: reverse_edge_type,
        id2: edge.getID1(),
        data: edge.getData(),
      });
      await Promise.all([
        checkEdgeCreate(this, viewer, edge),
        checkEdgeCreate(this, viewer, r_edge)
      ]);
      var [result, error] = await this.execute(
        'INSERT INTO edges (id1, type, id2, data, status) VALUES ' +
          '(uuid2bin(?), ?, uuid2bin(?), ?, ?),' +
          '(uuid2bin(?), ?, uuid2bin(?), ?, ?);',
        [edge.getID1(), edge.getType(), edge.getID2(), edge.getData(), Constants.Status.VISIBLE,
         r_edge.getID1(), r_edge.getType(), r_edge.getID2(), r_edge.getData(), Constants.Status.VISIBLE]
      );
      return !error && (result.affectedRows === 2);
    } else {
      await checkEdgeCreate(this, viewer, edge);
      var [result, error] = await this.execute(
        'INSERT INTO edges (id1, type, id2, data, status) VALUES (uuid2bin(?), ?, uuid2bin(?), ?, ?);',
        [edge.getID1(), edge.getType(), edge.getID2(), edge.getData(), Constants.Status.VISIBLE]
      );
      return !error && (result.affectedRows === 1);
    }
  }

  static async modifyEdgeData(viewer, edge) {
    var reverse_edge_type = getReverseEdgeType(edge.getType());
    if (reverse_edge_type !== null) {
      var r_edge = Constants.getEdgeInstance(viewer, {
        id1: edge.getID2(),
        type: reverse_edge_type,
        id2: edge.getID1(),
        data: edge.getData(),
      });
      await Promise.all([
        checkEdgeModify(viewer, edge),
        checkEdgeModify(viewer, r_edge)
      ]);
      var [result, error] = await this.execute(
        'UPDATE edges SET data=? WHERE ' +
          '(id1=uuid2bin(?) AND id2=uuid2bin(?) AND type=?) OR ' +
          '(id1=uuid2bin(?) AND id2=uuid2bin(?) AND type=?);',
        [edge.getData(),
         edge.getID1(), edge.getID2(), edge.getType(),
         r_edge.getID1(), r_edge.getID2(), r_edge.getType()]
      );
      return !error && (result.affectedRows === 2);
    } else {
      await checkEdgeModify(viewer, edge);
      var [result, error] = await this.execute(
        'UPDATE edges SET data=? WHERE id1=uuid2bin(?) AND id2=uuid2bin(?) AND type=?;',
        [edge.getData(), edge.getID1(), edge.getID2(), edge.getType()]
      );
      return !error && (result.affectedRows === 1);
    }
  }

  static async deleteEdge(viewer, edge) {
    var reverse_edge_type = getReverseEdgeType(edge.getType());
    if (reverse_edge_type !== null) {
      var r_edge = Constants.getEdgeInstance(viewer, {
        id1: edge.getID2(),
        type: reverse_edge_type,
        id2: edge.getID1(),
        data: edge.getData(),
      });
      await Promise.all([
        checkEdgeModify(viewer, edge),
        checkEdgeModify(viewer, r_edge)
      ]);
      var [result, error] = await this.execute(
        'UPDATE edges SET status=? WHERE ' +
          '(id1=uuid2bin(?) AND id2=uuid2bin(?) AND type=?) OR ' +
          '(id1=uuid2bin(?) AND id2=uuid2bin(?) AND type=?);',
        [Constants.Status.DELETED,
         edge.getID1(), edge.getID2(), edge.getType(),
         r_edge.getID1(), r_edge.getID2(), r_edge.getType()]
      );
      return !error && (result.affectedRows === 2);
    } else {
      await checkEdgeModify(viewer, edge);
      var [result, error] = await this.execute(
        'UPDATE edges SET status=? WHERE id1=uuid2bin(?) AND id2=uuid2bin(?) AND type=?;',
        [Constants.Status.DELETED, edge.getID1(), edge.getID2(), edge.getType()]
      );
      return !error && (result.affectedRows === 1);
    }
  }

  static async lookupIndex(type, key, query_value) {
    var value = stringifyObjectValue(query_value);
    if (!value) {
      return null;
    }
    var [rows, error] = await this.execute(
      'SELECT bin2uuid(value) as id FROM indices WHERE key=UNHEX(SHA1(?));',
      [type+':'+key+':'+value]
    );
    if (error || !rows) {
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
    var [result, error] = await this.execute(
      'INSERT IGNORE INTO indices (key, value) VALUES (UNHEX(SHA1(?)), uuid2bin(?));',
      [object.getType()+':'+key+':'+value, object.getID()]
    );
    return !error;
  }

  static async deleteIndex(object, key) {
    var value = stringifyObjectValue(object.getData()[key]);
    if (!value) {
      return false;
    }
    var [result, error] = await this.execute(
      'DELETE FROM indices WHERE key=UNHEX(SHA1(?)) AND value=uuid2bin(?);',
      [object.getType()+':'+key+':'+value, object.getID()]
    );
    return !error;
  }
}

DB._pool = null;

module.exports = DB;
