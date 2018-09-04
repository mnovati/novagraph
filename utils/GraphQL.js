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
      (node.arguments || []).forEach(arg => {
        if (arg.name.value === 'to_id') {
          to_id = arg.value.value;
        }
      });
      var ids_to_fetch = {};
      var edge_type = ng.CONSTANTS.getEdgeTypeFromName(object.getType(), node.name.value);
      if (to_id) {
        result = await DB.getSingleEdge(viewer, object.getID(), edge_type, to_id);
        result = [result];
      } else {
        result = await DB.getEdge(viewer, object.getID(), edge_type);
      }
      (result || []).filter(Boolean).forEach((edge) => {
        edges.push(edge);
        ids_to_fetch[edge.getToID()] = true;
      });
      await Promise.all(Object.keys(ids_to_fetch).map(async object_id => {
        var object = await DB.getObject(viewer, object_id);
        objects[object_id] = object;
      }));
    } else {
      var type = ng.CONSTANTS.getObjectTypeFromName(node.name.value);
      var object_ids = [];
      if ((node.arguments || []).length > 0) {
        await Promise.all(node.arguments.map(async arg => {
          if (arg.name.value === 'id') {
            object_ids.push(arg.value.value);
          } else if (arg.name.value === 'ids') {
            arg.value.values.forEach(id => object_ids.push(id.value));
          } else if (arg.name.value === 'point') {
            var [lat, lng, distance] = arg.value.values;
            var matches = await DB.lookupGeoIndex({lat: lat.value, lng: lng.value}, [type], (distance.value || 1) * 1.6 * 1000);
            (matches || []).forEach(id => object_ids.push(id));
          } else {
            var matches = await DB.lookupIndex(type, arg.name.value, arg.value.value);
            (matches || []).forEach(id => object_ids.push(id));
          }
        }));
      } else {
        var config = ng.CONSTANTS.getObject(type);
        if (!config.root_id) {
          NovaError.throwError('Cannot fetch all objects for given type');
        }
        var edge = await DB.getEdge(viewer, config.root_id, ng.CONSTANTS.ROOT_EDGE);
        edge.forEach(e => object_ids.push(e.getToID()));
      }
      await Promise.all(object_ids.map(async object_id => {
        var object = await DB.getObject(viewer, object_id);
        if (object && (object.getType() !== type)) {
          NovaError.throwError('Object type does not match requested type');
        }
        objects[object_id] = object;
      }));
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
