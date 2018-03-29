const mysql = require('mysql2/promise');
const uuidv1 = require('uuid/v1');

const Constants = require('./constants.js');

function clean_string(s) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

  static async checkViewerID(viewer_id, uuid) {
    var connection = await this.getConnection();
    var [rows, _] = await connection.execute(
      'SELECT bin2uuid(id) as id, data '+
      'FROM objects '+
      'WHERE id=uuid2bin("'+viewer_id+'");'
    );
    if (!rows || rows.length !== 1) {
      return false;
    }
    var result = rows[0];
    result.id = result.id.toString();
    return result.data && result.data.cognito_uuid === uuid;
  }

  static async getObject(viewer, id) {
    var connection = await this.getConnection();
    var [rows, _] = await connection.execute(
      'SELECT bin2uuid(id) as id, type, data, status, time_created, time_updated '+
      'FROM objects '+
      'WHERE id=uuid2bin("'+id+'") AND status='+Constants.Status.VISIBLE+';'
    );
    if (!rows || rows.length !== 1) {
      return null;
    }
    var result = rows[0];
    result.id = result.id.toString();
    var object = Constants.getObjectInstance(viewer, result);
    var can_see = await object.canSee();
    return can_see ? object : null;
  }

  static async createObject(viewer, type, data) {
    var connection = await this.getConnection();
    if (type === null) {
      throw new Error('Missing type in create object');
      return null;
    }
    var temp_object = Constants.getObjectInstance(viewer, { type: type, data: data });
    var can_create = await temp_object.canCreate();
    if (!can_create) {
      throw new Error('Viewer does not have permission to create object');
      return null;
    }
    var uuid = uuidv1();
    var [result, error] = await connection.execute(
      'INSERT INTO objects (`id`, `type`, `data`, `status`) VALUES ('+
        'uuid2bin("'+uuid+'"), '+
        type+', '+
        '"'+clean_string(JSON.stringify(data))+'", '+
        Constants.Status.VISIBLE+
      ');'
    );
    return error ? null : uuid;
  }

  static async modifyObject(viewer, object) {
    var connection = await this.getConnection();
    var can_modify = await object.canModify();
    if (!can_modify) {
      throw new Error('Viewer does not have permission to update object');
      return null;
    }
    var [result, error] = await connection.execute(
      'UPDATE objects SET `data`="'+clean_string(JSON.stringify(object.getData()))+'" '+
      'WHERE id=uuid2bin("'+object.getID()+'");'
    );
    return !error;
  }

  static async deleteObject(viewer, object) {
    var connection = await this.getConnection();
    var can_modify = await object.canModify();
    if (!can_modify) {
      throw new Error('Viewer does not have permission to delete object');
      return null;
    }
    var [result, error] = await connection.execute(
      'UPDATE objects SET `status`='+Constants.Status.DELETED+' '+
      'WHERE id=uuid2bin("'+object.getID()+'");'
    );
    return !error;
  }

  static async getEdge(viewer, id, type) {
    var connection = await this.getConnection();
    var [rows, _] = await connection.execute(
      'SELECT bin2uuid(id1) as id1, type, bin2uuid(id2) as id2, data, time_created, time_updated '+
      'FROM edges '+
      'WHERE id1=uuid2bin("'+id+'") AND type='+type+' AND status='+Constants.Status.VISIBLE+';'
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
        var can_see = await edge.canSee();
        return can_see ? edge : null;
      })());
    }
    results = await Promise.all(handles);
    return results.filter(Boolean);
  }

  static async createEdge(viewer, edge) {
    var connection = await this.getConnection();
    if (edge.getType() === null) {
      throw new Error('Missing type in create edge');
      return null;
    }
    var can_create = await edge.canCreate();
    if (!can_create) {
      throw new Error('Viewer does not have permission to create edge');
      return null;
    }
    var [result, error] = await connection.execute(
      'INSERT INTO edges (`id1`, `type`, `id2`, `data`, `status`) VALUES ('+
        'uuid2bin("'+edge.getID1()+'"), '+
        edge.getType()+', '+
        'uuid2bin("'+edge.getID2()+'"), '+
        '"'+clean_string(edge.getData())+'", ' +
        Constants.Status.VISIBLE+
      ');'
    );
    return !error;
  }

  static async modifyEdge(viewer, edge) {
    var connection = await this.getConnection();
    var can_modify = await edge.canModify();
    if (!can_modify) {
      throw new Error('Viewer does not have permission to update edge');
      return null;
    }
    var [result, error] = await connection.execute(
      'UPDATE edges SET `data`="'+clean_string(edge.getData())+'" '+
      'WHERE id1=uuid2bin("'+edge.getID1()+'") AND id2=uuid2bin("'+edge.getID2()+'") AND type='+edge.getType()+
      ';'
    );
    return !error;
  }

  static async deleteEdge(viewer, edge) {
    var connection = await this.getConnection();
    var can_modify = await edge.canModify();
    if (!can_modify) {
      throw new Error('Viewer does not have permission to delete edge');
      return null;
    }
    var [result, error] = await connection.execute(
      'UPDATE edges SET `status`='+Constants.Status.DELETED+' '+
      'WHERE id1=uuid2bin("'+edge.getID1()+'") AND id2=uuid2bin("'+edge.getID2()+'") AND type='+edge.getType()+
      ';'
    );
    return !error;
  }
}

DB._c = null;

DB._config = null;

module.exports = DB;
