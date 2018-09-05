const graphql = require('graphql/language');
const NovaError = require('./NovaError.js');

async function parseSet(ng, DB, viewer, object, nodes) {
  var objects = {};
  var edges = [];
  if (!nodes || !nodes.selections) {
    return [objects, edges];
  }
  await Promise.all(nodes.selections.map(async node => {
    if (object) {
      var to_id = null;
      var count = null;
      var offset = null;
      var after = null;
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
        }
      }));
      var ids_to_fetch = {};
      var edge_type = ng.CONSTANTS.getEdgeTypeFromName(object.getType(), node.name.value);
      if (to_id) {
        result = await DB.getSingleEdge(viewer, object.getID(), edge_type, to_id);
        result = [result];
      } else {
        result = await DB.getEdge(viewer, object.getID(), edge_type);
      }
      result = (result || []).filter(Boolean);

      // pagination
      count = count === null ? result.length : count;
      var add = after === null && offset === null;
      for (var ii = 0; ii < result.length && count > 0; ii++) {
        add = add || (offset !== null && offset === ii);
        if (add) {
          edges.push(edge);
          ids_to_fetch[result[ii].getToID()];
          count--;
        }
        add = add || (after !== null && result[ii].getToID() === after);
      }
      await Promise.all(Object.keys(ids_to_fetch).map(async object_id => {
        var object = await DB.getObject(viewer, object_id);
        objects[object_id] = object;
      }));
    } else {
      var type = ng.CONSTANTS.getObjectTypeFromName(node.name.value);
      var object_ids = [];
      var count = null;
      var offset = null;
      var after = null;
      var missing = true;
      await Promise.all((node.arguments || []).map(async arg => {
        if (arg.name.value === 'id') {
          object_ids.push(arg.value.value);
          missing = false;
        } else if (arg.name.value === 'ids') {
          arg.value.values.forEach(id => object_ids.push(id.value));
          missing = false;
        } else if (arg.name.value === 'point') {
          var [lat, lng, distance] = arg.value.values;
          var matches = await DB.lookupGeoIndex({lat: lat.value, lng: lng.value}, [type], (distance.value || 1) * 1.6 * 1000);
          (matches || []).forEach(id => object_ids.push(id));
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
          var matches = await DB.lookupIndex(type, arg.name.value, arg.value.value);
          (matches || []).forEach(id => object_ids.push(id));
          missing = false;
        }
      }));
      if (missing) {
        var config = ng.CONSTANTS.getObject(type);
        if (!config.root_id) {
          NovaError.throwError('Cannot fetch all objects for given type');
        }
        var edge = await DB.getEdge(viewer, config.root_id, ng.CONSTANTS.ROOT_EDGE);
        edge.forEach(e => object_ids.push(e.getToID()));
      }
      var fetched = [];
      await Promise.all(object_ids.map(async object_id => {
        var object = await DB.getObject(viewer, object_id);
        if (object && (object.getType() !== type)) {
          NovaError.throwError('Object type does not match requested type');
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
      var [more_objects, more_edges] = await parseSet(viewer, objects[object_id], node.selectionSet);
      Object.keys(more_objects).map(i => objects[i] = more_objects[i]);
      more_edges.forEach(e => edges.push(e));
    }));
  }));
  return [objects, edges];
}

class GraphQL {

  static async execute(ng, DB, viewer, query) {
    var node = graphql.parse(query);
    return await parseSet(ng, DB, viewer, null, node.definitions[0].selectionSet);
  }
}

module.exports = GraphQL;
