const graphql = require('graphql/language');
const NovaError = require('./NovaError.js');

async function parseSet(ng, DB, viewer, object, nodes) {
  var objects = {};
  var edges = [];
  var edge_counts = [];
  if (!nodes || !nodes.selections) {
    return [objects, edges, edge_counts];
  }
  await Promise.all(nodes.selections.map(async node => {
    if (object) {
      var to_id = null;
      var count = null;
      var offset = null;
      var after = null;
      var count_only = false;
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
        } else if (arg.name.value === 'count') {
          count_only = true;
        }
      }));
      var ids_to_fetch = {};
      var edge_type = ng.CONSTANTS.getEdgeTypeFromName(object.getType(), node.name.value);
      if (count_only) {
        result = await DB.getEdge(viewer.getReadAllViewer(), object.getID(), edge_type);
      } else if (to_id) {
        result = await DB.getSingleEdge(viewer, object.getID(), edge_type, to_id);
        result = [result];
      } else {
        result = await DB.getEdge(viewer, object.getID(), edge_type);
      }
      result = (result || []).filter(Boolean);

      // pagination
      if (count_only) {
        edge_counts.push({
          from_id: object.getID(),
          type: edge_type,
          count: result.length
        });
        if (node.selectionSet && node.selectionSet.selections && node.selectionSet.selections.length > 0) {
          throw new Error('Cannot have selections in a count-only row');
        }
      } else {
        count = count === null ? result.length : count;
        var add = after === null && offset === null;
        for (var ii = 0; ii < result.length && count > 0; ii++) {
          add = add || (offset !== null && offset === ii);
          if (add) {
            edges.push(result[ii]);
            ids_to_fetch[result[ii].getToID()] = true;
            count--;
          }
          add = add || (after !== null && result[ii].getToID() === after);
        }
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
      var index_object_ids = {};
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
          index_object_ids.geo = matches || [];
          missing = false;
        } else if (arg.name.value === 'text_index') {
          var text_indices = ng.CONSTANTS.getObject(type).text_index || {};
          index_object_ids.text = [];
          await Promise.all(Object.keys(text_indices).map(async index_type => {
            var matches = await DB.lookupTextIndex(index_type, arg.value.value);
            (matches || []).forEach(id => index_object_ids.text.push(id));
          }));
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
          index_object_ids[arg.name.value] = matches || [];
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
      var [more_objects, more_edges, more_edge_counts] = await parseSet(ng, DB, viewer, objects[object_id], node.selectionSet);
      Object.keys(more_objects).map(i => objects[i] = more_objects[i]);
      more_edges.forEach(e => edges.push(e));
      more_edge_counts.forEach(e => edge_counts.push(e));
    }));
  }));
  return [objects, edges, edge_counts];
}

class GraphQL {

  static async execute(ng, DB, viewer, query) {
    var node = graphql.parse(query);
    return await parseSet(ng, DB, viewer, null, node.definitions[0].selectionSet);
  }
}

module.exports = GraphQL;
