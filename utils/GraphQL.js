const graphql = require('graphql/language');
const uuidValidate = require('uuid-validate');
const NError = require('../lib/error.js');
const DBUtils = require('./DBUtils.js');

async function parseSet(NovaGraph, DB, viewer, object, nodes) {
  var objects = {};
  var edges = [];
  var edge_counts = [];
  if (!nodes || !nodes.selections) {
    return [objects, edges, edge_counts];
  }
  await Promise.all(nodes.selections.map(async node => {
    if (object) {
      var edge_type = null;
      try {
        edge_type = NovaGraph.Constants.getEdgeTypeFromName(object.getType(), node.name.value);
      } catch (e) {
        edge_type = null;
      }
      var ids_to_fetch = {};
      if (edge_type !== null) {
        var to_id = null;
        var count = null;
        var offset = null;
        var after = null;
        var time_after = null;
        var time_before = null;
        var count_only = false;
        var no_objects = false;
        var order_field = null;
        var order_dir = null;
        var intersect_id = null;
        await Promise.all((node.arguments || []).map(async arg => {
          if (arg.name.value === 'to_id') {
            to_id = arg.value.value;
          } else if (arg.name.value === 'first') {
            count = parseInt(arg.value.value);
          } else if (arg.name.value === 'offset') {
            offset = parseInt(arg.value.value);
            if (after !== null) {
              after = null;
            }
          } else if (arg.name.value === 'after') {
            after = arg.value.value;
            if (offset !== null) {
              offset = null;
            }
          } else if (arg.name.value === 'time_before') {
            time_before = new Date(arg.value.value).getTime();
          } else if (arg.name.value === 'time_after') {
            time_after = new Date(arg.value.value).getTime();
          } else if (arg.name.value === 'count') {
            count_only = true;
          } else if (arg.name.value === 'noobjects') {
            no_objects = true;
          } else if (arg.name.value === 'intersect_to_id') {
            intersect_id = arg.value.value;
          } else if (arg.name.value === 'orderBy') {
            if (arg.value.value.endsWith('_DESC')) {
              order_field = arg.value.value.slice(0, -5);
              order_dir = 'DESC';
            } else if (arg.value.value.endsWith('_ASC')) {
              order_field = arg.value.value.slice(0, -4);
              order_dir = 'ASC';
            } else {
              throw NError.normal('orderBy must end with _DESC or _ASC');
            }
          }
        }));
        var intersect_result = null;
        if (count_only) {
          result = await DB.getEdge(viewer.getReadAllViewer(), object.getID(), edge_type);
          if (intersect_id !== null) {
            intersect_result = await DB.getEdge(viewer.getReadAllViewer(), intersect_id, edge_type);
          }
        } else if (to_id) {
          result = await DB.getSingleEdge(viewer, object.getID(), edge_type, to_id);
          result = [result];
        } else {
          result = await DB.getEdge(viewer, object.getID(), edge_type);
          if (intersect_id !== null) {
            intersect_result = await DB.getEdge(viewer.getReadAllViewer(), intersect_id, edge_type);
          }
        }
        result = (result || []).filter(Boolean);
        if (intersect_result !== null) {
          var intersect_map = {};
          intersect_result = intersect_result.forEach(e => { intersect_map[e.getToID()] = true; });
          result = result.filter(e => (e.getToID() in intersect_map));
        }

        // pagination
        if (count_only) {
          var filtered_count = 0;
          for (var ii = 0; ii < result.length; ii++) {
            if ((time_after === null || new Date(result[ii].edge.time_updated).getTime() > time_after) &&
                (time_before === null || new Date(result[ii].edge.time_updated).getTime() < time_before)) {
              filtered_count++;
            }
          }
          edge_counts.push({
            from_id: object.getID(),
            type: edge_type,
            count: filtered_count
          });
          if (node.selectionSet && node.selectionSet.selections && node.selectionSet.selections.length > 0) {
            throw NError.normal('Cannot have selections in a count-only row');
          }
        } else {
          if (order_field !== null && order_dir !== null) {
            result.sort((a, b) => {
              return ((a.edge[order_field] || 0) - (b.edge[order_field] || 0)) * (order_dir === 'DESC' ? -1 : 1);
            });
          }
          count = count === null ? result.length : count;
          var add = after === null && offset === null;
          for (var ii = 0; ii < result.length && count > 0; ii++) {
            add = add || (offset !== null && offset === ii);
            if (add) {
              if ((time_after === null || new Date(result[ii].edge.time_created).getTime() > time_after) &&
                  (time_before === null || new Date(result[ii].edge.time_created).getTime() < time_before)) {
                edges.push(result[ii]);
                ids_to_fetch[result[ii].getToID()] = true;
                count--;
              }
            }
            add = add || (after !== null && result[ii].getToID() === after);
          }
        }
        if (no_objects) {
          ids_to_fetch = {};
        }
      } else {
        var use_name = node.name.value;
        var object_data = {};
        if (use_name.startsWith('viewer_data.')) {
          use_name = use_name.substring(12);
          object_data = await object.getViewerData();
        } else {
          object_data = await object.getData();
        }
        if (use_name in object_data) {
          var object_value = object_data[use_name];
          if (!object_value) {
            // do nothing, the field isn't set on this object
          } else if (Array.isArray(object_value)) {
            object_value.forEach(id => {
              if ((typeof id === 'string' || id instanceof String) && uuidValidate(id)) {
                ids_to_fetch[id] = true;
              } else if (typeof id === 'object') {
                id = id.id;
                if ((typeof id === 'string' || id instanceof String) && uuidValidate(id)) {
                  ids_to_fetch[id] = true;
                }
              }
            });
          } else if ((typeof object_value === 'string' || object_value instanceof String) && uuidValidate(object_value)) {
            ids_to_fetch[object_value] = true;
          } else if (typeof object_value === 'object') {
            var id = object_value.id;
            if ((typeof id === 'string' || id instanceof String) && uuidValidate(id)) {
              ids_to_fetch[id] = true;
            }
            var values = Object.values(object_value);
            values.forEach(id => {
              if ((typeof id === 'string' || id instanceof String) && uuidValidate(id)) {
                ids_to_fetch[id] = true;
              }
            });
          } else if (object_value) {
            throw NError.normal('Field must contain string or array', {
              field: node.name.value,
              provided: (typeof object_value),
            });
          }
        }
      }
      await Promise.all(Object.keys(ids_to_fetch).map(async object_id => {
        var object = await DB.getObject(viewer, object_id);
        objects[object_id] = object;
      }));
    } else {
      var type = node.name.value === 'object' ? -1 : NovaGraph.Constants.getObjectTypeFromName(node.name.value);
      var object_ids = [];
      var count = null;
      var offset = null;
      var after = null;
      var missing = true;
      var index_object_ids = [];
      await Promise.all((node.arguments || []).map(async arg => {
        if (arg.name.value === 'id') {
          object_ids.push(arg.value.value);
          missing = false;
        } else if (arg.name.value === 'ids') {
          arg.value.values.forEach(id => object_ids.push(id.value));
          missing = false;
        } else if (arg.name.value === 'point') {
          if (type === -1) {
            throw NError.normal('Cannot fetch by point without supplying object type');
          }
          var [lat, lng, distance] = arg.value.values;
          var matches = await DB.lookupGeoIndex({lat: lat.value, lng: lng.value}, [type], (distance.value || 1) * 1.6 * 1000);
          index_object_ids.push(matches || []);
          missing = false;
        } else if (arg.name.value === 'text_index') {
          if (type === -1) {
            throw NError.normal('Cannot fetch by text without supplying object type');
          }
          var text_indices = NovaGraph.Constants.getObject(type).text_index || {};
          var to_add = [];
          await Promise.all((arg.value.values || [arg.value]).map(async term => {
            await Promise.all(Object.keys(text_indices).map(async index_type => {
              var matches = await DB.lookupTextIndex(index_type, (term.value || '').trim());
              (matches || []).forEach(id => to_add.push(id));
            }));
          }));
          index_object_ids.push(to_add);
          missing = false;
        } else if (arg.name.value === 'first') {
          count = parseInt(arg.value.value);
        } else if (arg.name.value === 'offset') {
          offset = parseInt(arg.value.value);
          if (after !== null) {
            after = null;
          }
        } else if (arg.name.value === 'after') {
          after = arg.value.value;
          if (offset !== null) {
            offset = null;
          }
        } else {
          if (type === -1) {
            throw NError.normal('Cannot fetch by index without supplying object type');
          }
          var config = NovaGraph.Constants.getObject(type);
          var to_add = [];
          if ((config.index || []).includes(arg.name.value) || (config.unique_index || []).includes(arg.name.value)) {
            await Promise.all((arg.value.values || [arg.value]).map(async term => {
              var matches = await DB.lookupIndex(type, arg.name.value, term.value);
              to_add = to_add.concat(matches || []);
            }));
            missing = false;
          } else if ((config.time_index || []).includes(arg.name.value)) {
            await Promise.all((arg.value.values || [arg.value]).map(async term => {
              var split = term.value.split(' ');
              var matches = await DB.lookupTimeIndex(type, arg.name.value, split[0], split[1] || null);
              to_add = to_add.concat(matches || []);
            }));
            missing = false;
          }
          index_object_ids.push(to_add);
        }
      }));
      if (missing) {
        if (node.name.value === 'viewer') {
          object_ids.push(viewer.getID());
        } else {
          var config = NovaGraph.Constants.getObject(type);
          if (!config.root_id) {
            throw NError.normal('Cannot fetch all objects for given type');
          }
          var edge = await DB.getEdge(viewer, config.root_id, NovaGraph.Constants.ROOT_EDGE);
          edge.forEach(e => object_ids.push(e.getToID()));
        }
      }

      // find intersection of all indices used
      var to_merge = Object.values(index_object_ids);
      if (to_merge.length > 0) {
        var intersection = to_merge.shift();
        while (to_merge.length > 0) {
          var next = to_merge.shift();
          intersection = intersection.filter(x => next.includes(x));
        }
        intersection.forEach(id => object_ids.push(id));
      }

      var fetched = [];
      await Promise.all(object_ids.map(async object_id => {
        var object = await DB.getObject(viewer, object_id);
        if (type !== -1 && object && (object.getType() !== type)) {
          throw NError.normal('Object type does not match requested type');
        }
        if (object) {
          fetched.push(object);
        }
      }));

      // pagination
      count = count === null ? fetched.length : count;
      var add = after === null && offset === null;
      for (var ii = 0; ii < fetched.length && count > 0; ii++) {
        add = add || (offset !== null && offset === ii);
        if (add) {
          objects[fetched[ii].getID()] = fetched[ii];
          count--;
        }
        add = add || (after !== null && fetched[ii].getID() === after);
      }
    }
    await Promise.all(Object.keys(objects).map(async object_id => {
      if (!objects[object_id]) {
        return;
      }
      var [more_objects, more_edges, more_edge_counts] = await parseSet(ng, DB, viewer, objects[object_id], node.selectionSet);
      Object.keys(more_objects).map(i => objects[i] = more_objects[i]);
      more_edges.forEach(e => edges.push(e));
      more_edge_counts.forEach(e => edge_counts.push(e));
    }));
  }));
  return [objects, edges, edge_counts];
}

async function createOrUpdateEdge(ng, DB, viewer, from_id, type, to_id, data) {
  var existing = await DB.getSingleEdge(viewer, from_id, type, to_id);
  if (existing) {
    if (data !== null && data != existing.getData()) {
      var raw_edge = await existing.getRaw();
      raw_edge.data = data;
      await DB.modifyEdgeData(viewer, NovaGraph.Constants.getEdgeInstance(viewer, raw_edge));
    }
  } else {
    await DB.createEdge(viewer, NovaGraph.Constants.getEdgeInstance(viewer, {
      from_id: from_id,
      to_id: to_id,
      type: type,
      data: data === null ? '' : data
    }));
  }
  return await DB.getSingleEdge(viewer, from_id, type, to_id);
}

async function parseMutationSet(ng, DB, viewer, object, nodes) {
  var objects = {};
  var edges = [];
  if (!nodes || !nodes.selections) {
    return [objects, edges];
  }
  await Promise.all(nodes.selections.map(async node => {
    if (object) {
      var ids_to_fetch = {};
      var single_to_id = false;
      var has_to_ids = false;
      var to_ids = [];
      var from_ids = [];
      var delete_to_ids = [];
      var delete_from_ids = [];
      var data = null;
      await Promise.all((node.arguments || []).map(async arg => {
        if (arg.name.value === 'to_id') {
          to_ids.push(arg.value.value);
          single_to_id = true;
        } else if (arg.name.value === 'to_ids') {
          arg.value.values.forEach(id => to_ids.push(id.value));
          has_to_ids = true;
        } else if (arg.name.value === 'from_id') {
          from_ids.push(arg.value.value);
        } else if (arg.name.value === 'from_ids') {
          arg.value.values.forEach(id => from_ids.push(id.value));
        } else if (arg.name.value === 'delete_to_id') {
          delete_to_ids.push(arg.value.value);
        } else if (arg.name.value === 'delete_to_ids') {
          arg.value.values.forEach(id => delete_to_ids.push(id.value));
        } else if (arg.name.value === 'delete_from_id') {
          delete_from_ids.push(arg.value.value);
        } else if (arg.name.value === 'delete_from_ids') {
          arg.value.values.forEach(id => delete_from_ids.push(id.value));
        } else if (arg.name.value === 'data') {
          data = decodeURI(arg.value.value);
        }
      }));
      to_ids = to_ids.filter(Boolean);
      from_ids = from_ids.filter(Boolean);
      delete_to_ids = delete_to_ids.filter(Boolean);
      delete_from_ids = delete_from_ids.filter(Boolean);
      if ((to_ids.length > 0 || has_to_ids) && from_ids.length > 0) {
        throw NError.normal('Can only have to or from ids but not both in edge mutation');
      }
      if (delete_to_ids.length > 0 && delete_from_ids.length > 0) {
        throw NError.normal('Can only delete to or from ids but not both in edge mutation');
      }
      if (((to_ids.length > 0 || has_to_ids) && delete_from_ids.length > 0) || (delete_to_ids.length > 0 && from_ids.length > 0)) {
        throw NError.normal('Cannot add and delete some to edges and some from edges at the same time');
      }
      var result;
      if (to_ids.length > 0 || has_to_ids) {
        var edge_type = NovaGraph.Constants.getEdgeTypeFromName(object.getType(), node.name.value);
        if (edge_type === null) {
          throw NError.normal('Invalid edge type', { type: node.name.value });
        }
        result = await Promise.all(to_ids.map(async to_id => {
          return await createOrUpdateEdge(ng, DB, viewer, object.getID(), edge_type, to_id, data);
        }));
        if (!single_to_id) {
          var all_edges = await DB.getEdge(viewer, object.getID(), edge_type);
          all_edges = (all_edges || []).filter((edge) => !to_ids.includes(edge.getToID()));
          await Promise.all(all_edges.map(async (edge) => await DB.deleteEdge(viewer, edge)));
        }
      } else if (from_ids.length > 0) {
        result = await Promise.all(from_ids.map(async from_id => {
          var from_object = await DB.getObject(viewer, from_id);
          var edge_type = NovaGraph.Constants.getEdgeTypeFromName(from_object.getType(), node.name.value);
          if (edge_type === null) {
            throw NError.normal('Invalid edge type', { type: node.name.value });
          }
          return await createOrUpdateEdge(ng, DB, viewer, from_id, edge_type, object.getID(), data);
        }));
      }
      if (delete_to_ids.length > 0) {
        var edge_type = NovaGraph.Constants.getEdgeTypeFromName(object.getType(), node.name.value);
        if (edge_type === null) {
          throw NError.normal('Invalid edge type', { type: node.name.value });
        }
        result = await Promise.all(delete_to_ids.map(async to_id => {
          return await DB.deleteEdge(viewer, NovaGraph.Constants.getEdgeInstance(viewer, {
            from_id: object.getID(),
            to_id: to_id,
            type: edge_type,
            data: data === null ? '' : data
          }));
        }));
        if (result.filter(Boolean).length !== delete_to_ids.length) {
          throw NError.normal('Error deleting edges', { type: node.name.value, ids: delete_to_ids });
        }
        result = [];
      } else if (delete_from_ids.length > 0) {
        result = await Promise.all(delete_from_ids.map(async from_id => {
          var from_object = await DB.getObject(viewer, from_id);
          var edge_type = NovaGraph.Constants.getEdgeTypeFromName(from_object.getType(), node.name.value);
          if (edge_type === null) {
            throw NError.normal('Invalid edge type', { type: node.name.value });
          }
          return await DB.deleteEdge(viewer, NovaGraph.Constants.getEdgeInstance(viewer, {
            from_id: from_id,
            to_id: object.getID(),
            type: edge_type,
            data: data === null ? '' : data
          }));
        }));
        if (result.filter(Boolean).length !== delete_from_ids.length) {
          throw NError.normal('Error deleting edges', { type: node.name.value, ids: delete_from_ids });
        }
        result = [];
      }
      result = (result || []).filter(Boolean);

      for (var ii = 0; ii < result.length; ii++) {
        edges.push(result[ii]);
        ids_to_fetch[result[ii].getToID()] = true;
      }
      await Promise.all(Object.keys(ids_to_fetch).map(async object_id => {
        var object = await DB.getObject(viewer, object_id);
        objects[object_id] = object;
      }));
    } else {
      var type = NovaGraph.Constants.getObjectTypeFromName(node.name.value);
      var data = null;
      var object_ids = [];
      var delete_object_ids = [];
      var missing = true;
      await Promise.all((node.arguments || []).map(async arg => {
        if (arg.name.value === 'id') {
          object_ids.push(arg.value.value);
          missing = false;
        } else if (arg.name.value === 'ids') {
          arg.value.values.forEach(id => object_ids.push(id.value));
          missing = false;
        } else if (arg.name.value === 'delete_id') {
          delete_object_ids.push(arg.value.value);
          missing = false;
        } else if (arg.name.value === 'delete_ids') {
          arg.value.values.forEach(id => delete_object_ids.push(id.value));
          missing = false;
        } else if (arg.name.value === 'data') {
          data = JSON.parse(decodeURI(arg.value.value));
        }
      }));
      if (missing) {
        if (node.name.value === 'viewer') {
          object_ids.push(viewer.getID());
          type = 0;
        }
      }
      if (object_ids.length > 0 && delete_object_ids.length > 0) {
        throw NError.normal('Cannot modify and delete in the same query');
      }
      if (data !== null && delete_object_ids.length > 0) {
        throw NError.normal('Cannot provide data when deleting objects');
      }
      if (data !== null) {
        if (object_ids.length === 0) {
          data.creator_id = viewer.getID();
          var id = await DB.createObject(viewer, type, data);
          object_ids.push(id);
        } else {
          await Promise.all(object_ids.map(async object_id => {
            var master = await DB.getObject(viewer.getReadAllViewer(), object_id);
            if (master && (master.getType() !== type)) {
              throw NError.normal('Object type does not match requested type');
            }
            if ('creator_id' in master.object.data) {
              data.creator_id = master.object.data.creator_id;
            }
            var result = await DB.modifyObjectData(viewer, object_id, data)
            if (!result) {
              throw NError.normal('Failed to update object', { id: object_id });
            }
          }));
        }
      }
      if (delete_object_ids.length > 0) {
        await Promise.all(delete_object_ids.map(async object_id => {
          await DBUtils(DB).deleteObjectAndEdges(viewer, object_id, type);
        }));
      }

      await Promise.all(object_ids.map(async object_id => {
        var object = await DB.getObject(viewer, object_id);
        if (object && (object.getType() !== type)) {
          throw NError.normal('Object type does not match requested type');
        }
        if (object) {
          objects[object.getID()] = object;
        }
      }));
    }
    await Promise.all(Object.keys(objects).map(async object_id => {
      if (!objects[object_id]) {
        return;
      }
      var [more_objects, more_edges] = await parseMutationSet(ng, DB, viewer, objects[object_id], node.selectionSet);
      Object.keys(more_objects).map(i => objects[i] = more_objects[i]);
      more_edges.forEach(e => edges.push(e));
    }));
  }));
  return [objects, edges];
}

class GraphQL {

  static async execute(ng, DB, viewer, query) {
    var node = null;
    try {
      node = graphql.parse(query);
    } catch (e){
      throw NError.normal(e.message, e);
    }
    return await parseSet(ng, DB, viewer, null, node.definitions[0].selectionSet);
  }

  static async mutate(ng, DB, viewer, query) {
    var node = null;
    try {
      node = graphql.parse(query);
    } catch (e){
      throw NError.normal(e.message, e);
    }
    return await parseMutationSet(ng, DB, viewer, null, node.definitions[0].selectionSet);
  }
}

module.exports = GraphQL;
