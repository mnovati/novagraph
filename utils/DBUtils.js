const Constants = require('../lib/constants.js');
const WriteAllViewer = require('../classes/WriteAllViewer.js');
const NovaError = require('./NovaError.js');

class DBUtils {

  constructor(DB) {
    this._DB = DB;
  }

  async createOrModifyObject(viewer, object_id, type, data, make_edges) {
    var created_new = false;
    if (object_id === null) {
      data['creator_id'] = viewer.getID();
      object_id = await this._DB.createObject(viewer, type, data);
      created_new = true;
    } else {
      var old_object = await this._DB.getObject(viewer, object_id);
      if (old_object && (old_object.getType() !== type)) {
        NovaError.throwError('Object type does not match requested type');
      }
      var old_data = await old_object.getData();
      data['creator_id'] = old_data.creator_id;
      var result = await this._DB.modifyObject(viewer, Constants.getObjectInstance(viewer, {
        id: object_id,
        type: type,
        data: data
      }));
      if (!result) {
        NovaError.throwError('Failed to update object: ' + object_id);
      }
    }

    var out_edges = [];
    var errors = [];
    var edges = [];
    var to_check = {};
    if (make_edges !== null) {
      await Promise.all(make_edges.map(async (edge) => {
        var [api_object_type, api_edge_type] = edge.type.split('/');
        var edge_from_id = edge.from_id || object_id;
        var edge_to_id = edge.to_id || object_id;
        var object_type = Constants.getObjectTypeFromName(api_object_type);
        var edge_type = Constants.getEdgeTypeFromName(object_type, api_edge_type);
        if (!(edge_type in to_check)) {
          to_check[edge_type] = [];
        }
        if (edge_from_id === object_id) {
          to_check[edge_type].push(edge_to_id);
        }
        if (edge_to_id === object_id) {
          var reverse_edge_type = Constants.getReverseEdgeTypeFromName(object_type, api_edge_type);
          if (reverse_edge_type !== null) {
            if (!(reverse_edge_type in to_check)) {
              to_check[reverse_edge_type] = [];
            }
            to_check[reverse_edge_type].push(edge_from_id);
          }
        }
        try {
          var existing = await this._DB.getSingleEdge(viewer, edge_from_id, edge_type, edge_to_id);
          if (existing) {
            if (('data' in edge) && edge.data != existing.getData()) {
              var raw_edge = await existing.getRaw();
              raw_edge.data = edge.data;
              var new_edge = Constants.getEdgeInstance(viewer, raw_edge);
              await this._DB.modifyEdgeData(viewer, new_edge);
              existing = await this._DB.getSingleEdge(viewer, edge_from_id, edge_type, edge_to_id);
            }
            out_edges.push(existing);
          } else {
            edges.push(Constants.getEdgeInstance(viewer, {
              from_id: edge_from_id,
              to_id: edge_to_id,
              type: edge_type,
              data: (('data' in edge) ? edge.data : '')
            }));
          }
        } catch (e) {
          errors.push(e);
        }
      }));
    }

    await Promise.all(Object.keys(to_check).map(async (key) => {
      try {
        var all_edges = await this._DB.getEdge(viewer, object_id, key);
        if (all_edges) {
          all_edges = all_edges.filter((edge) => !to_check[key].includes(edge.getToID()));
          await Promise.all(all_edges.map(async (edge) => await this._DB.deleteEdge(viewer, edge)));
        }
      } catch (e) {
        errors.push(e);
      }
    }));

    await Promise.all(edges.map(async (edge) => {
      if (errors.length > 0) {
        return;
      }
      try {
        var result = await this._DB.createEdge(viewer, edge);
        if (!result) {
          NovaError.throwError('Unknown error occurred creating edge');
        }
        out_edges.push(edge);
      } catch (e) {
        errors.push(e);
      }
    }));

    if (errors.length > 0) {
      if (created_new) {
        await this._DB.rollbackObject(object_id);
        if (out_edges.length > 0) {
          await this._DB.rollbackEdges(out_edges);
        }
      }
      var first = errors.shift();
      errors.forEach(e => NovaError.log(req, e));
      throw first;
    }
    var object = await this._DB.getObject(viewer, object_id);
    return [object, out_edges];
  }

  async createOrModifyEdge(viewer, from_id, from_type, to_id, edge_type, data) {
    if (!from_id) {
      NovaError.throwError('Missing source id for edge modification');
    }
    var object = await this._DB.getObject(viewer, from_id);
    if (object.getType() !== from_type) {
      NovaError.throwError('Object type does not match requested type');
    }
    if (!to_id) {
      NovaError.throwError('Missing destination id for edge modification');
    }
    var existing = await this._DB.getSingleEdge(viewer, from_id, edge_type, to_id);
    if (existing) {
      var raw_edge = await existing.getRaw();
      raw_edge.data = data;
      await this._DB.modifyEdgeData(viewer, Constants.getEdgeInstance(viewer, raw_edge));
    } else {
      await this._DB.createEdge(viewer, Constants.getEdgeInstance(viewer, {
        from_id: from_id,
        to_id: to_id,
        type: edge_type,
        data: data
      }));
    }
    return await this._DB.getSingleEdge(viewer, from_id, edge_type, to_id);
  }

  async deleteObjectAndEdges(viewer, id, type) {
    var object = await this._DB.getObject(viewer, id);
    if (!object) {
      NovaError.throwError('Error loading object to delete with id: ' + id);
    }
    if (object.getType() !== type) {
      NovaError.throwError('Object type does not match requested type');
    }
    var result = await this._DB.setObjectStatus(viewer, object, Constants.Status.DELETED);
    if (!result) {
      NovaError.throwError('Error deleting object');
    }
    await this._DB.quickChangeStatusAllEdges(
      new WriteAllViewer(0),
      object.getID(),
      Constants.Status.DELETED,
      Constants.Status.VISIBLE
    );
    return true;
  }

  async deleteSingleEdge(viewer, from_id, from_type, to_id, edge_type) {
    if (!from_id) {
      NovaError.throwError('Missing source id for edge deletion');
    }
    if (!to_id) {
      NovaError.throwError('Missing destination id for edge modification');
    }
    var object = await this._DB.getObject(viewer, from_id);
    if (object.getType() !== from_type) {
      NovaError.throwError('Object type does not match requested type');
    }
    var existing = await this._DB.getSingleEdge(viewer, from_id, edge_type, to_id);
    if (!existing) {
      NovaError.throwError('Cannot cannot be loaded or may not exists');
    }
    await this._DB.deleteEdge(viewer, existing);
  }
}

module.exports = function (DB) {
  return new DBUtils(DB);
}