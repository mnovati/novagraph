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
      var edge_type = null;
      try {
        edge_type = ng.CONSTANTS.getEdgeTypeFromName(object.getType(), node.name.value);
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
        var order_field = null;
        var order_dir = null;
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
          } else if (arg.name.value === 'orderBy') {
            if (arg.value.value.endsWith('_DESC')) {
              order_field = arg.value.value.slice(0, -5);
              order_dir = 'DESC';
            } else if (arg.value.value.endsWith('_ASC')) {
              order_field = arg.value.value.slice(0, -4);
              order_dir = 'ASC';
            } else {
              NovaError.throwError('orderBy must end with _DESC or _ASC');
            }
          }
        }));
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
            NovaError.throwError('Cannot have selections in a count-only row');
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
      } else {
        var object_data = await object.getData();
        if (node.name.value in object_data) {
          var object_value = object_data[node.name.value];
          if (Array.isArray(object_value)) {
            object_value.forEach(id => {
              if ((typeof id === 'string' || id instanceof String) && id.length > 0) {
                ids_to_fetch[id] = true;
              }
            });
          } else if ((typeof object_value === 'string' || object_value instanceof String) && ids_to_fetch.length > 0) {
            ids_to_fetch[object_value] = true;
          } else if (object_value) {
            NovaError.throwError('Field ' + node.name.value + ' must contain string or array');
          }
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
        if (node.name.value === 'viewer') {
          object_ids.push(viewer.getID());
          type = 0;
        } else {
          var config = ng.CONSTANTS.getObject(type);
          if (!config.root_id) {
            NovaError.throwError('Cannot fetch all objects for given type');
          }
          var edge = await DB.getEdge(viewer, config.root_id, ng.CONSTANTS.ROOT_EDGE);
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

async function parseMutationSet(ng, DB, viewer, object, nodes) {
  var objects = {};
  var edges = [];
  if (!nodes || !nodes.selections) {
    return [objects, edges];
  }
  await Promise.all(nodes.selections.map(async node => {
    if (object) {
      var ids_to_fetch = {};
			var to_ids = [];
			var from_ids = [];
			var data = null;
			await Promise.all((node.arguments || []).map(async arg => {
				if (arg.name.value === 'to_id') {
					to_ids.push(arg.value.value);
				} else if (arg.name.value === 'to_ids') {
          arg.value.values.forEach(id => to_ids.push(id.value));
				} else if (arg.name.value === 'from_id') {
					from_ids.push(arg.value.value);
				} else if (arg.name.value === 'from_ids') {
          arg.value.values.forEach(id => from_ids.push(id.value));
				} else if (arg.name.value === 'data') {
					data = arg.value.value;
				}
			}));
			if (data !== null && (to_ids.length > 0 || from_ids.length > 0)) {
				NovaError.throwError('Cannot have both object data and to or from ids in edge mutation');
			}
			if (to_ids.length > 0 && from_ids.length > 0) {
				NovaError.throwError('Can only have to or from ids but not both in edge mutation');
			}
			if (to_ids.length > 0) {
				result = await Promise.all(to_ids.map(async to_id => {
					var edge_type = ng.CONSTANTS.getEdgeTypeFromName(object.getType(), node.name.value);
					await DB.createEdge(viewer, Constants.getEdgeInstance(viewer, {
						from_id: object.getID(),
						to_id: to_id,
						type: edge_type,
						data: data === null ? '' : data
					}));
					return await DB.getSingleEdge(viewer, object.getID(), edge_type, to_id);
				}));
			} else if (from_ids.length > 0) {
				result = await Promise.all(from_ids.map(async from_id => {
					var from_object = await DB.getObject(viewer, from_id);
					var edge_type = ng.CONSTANTS.getEdgeTypeFromName(from_object.getType(), node.name.value);
					await DB.createEdge(viewer, Constants.getEdgeInstance(viewer, {
						from_id: from_id,
						to_id: object.getID(),
						type: edge_type,
						data: data === null ? '' : data
					}));
					return await DB.getSingleEdge(viewer, from_id, edge_type, object.getID());
				}));
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
      var type = ng.CONSTANTS.getObjectTypeFromName(node.name.value);
      var data = null;
      var object_ids = [];
      var missing = true;
      await Promise.all((node.arguments || []).map(async arg => {
        if (arg.name.value === 'id') {
          object_ids.push(arg.value.value);
          missing = false;
        } else if (arg.name.value === 'ids') {
          arg.value.values.forEach(id => object_ids.push(id.value));
          missing = false;
        } else if (arg.name.value === 'data') {
          data = JSON.parse(arg.value.values);
          missing = false;
        }
      }));
      if (missing) {
        if (node.name.value === 'viewer') {
          object_ids.push(viewer.getID());
          type = 0;
        }
      }
      if (data !== null) {
        if (object_ids.length === 0) {
          data.creator_id = viewer.getID();
          var id = DB.createObject(viewer, type, data);
          object_ids.push(id);
        } else {
          await Promise.all(object_ids.map(async object_id => {
						var old_object = await DB.getObject(viewer, object_id);
						if (old_object && (old_object.getType() !== type)) {
						  NovaError.throwError('Object type does not match requested type');
						}
						var old_data = await old_object.getData();
						data.creator_id = old_data.creator_id;
						var result = await DB.modifyObject(viewer, Constants.getObjectInstance(viewer, {
						  id: object_id,
						  type: type,
						  data: data
						}));
						if (!result) {
						  NovaError.throwError('Failed to update object: ' + object_id);
						}
          }));
        }
      }

      await Promise.all(object_ids.map(async object_id => {
        var object = await DB.getObject(viewer, object_id);
        if (object && (object.getType() !== type)) {
          NovaError.throwError('Object type does not match requested type');
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
      var [more_objects, more_edges] = await parseSet(ng, DB, viewer, objects[object_id], node.selectionSet);
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

  static async mutate(ng, DB, viewer, query) {
    var node = graphql.parse(query);
    return await parseMutationSet(ng, DB, viewer, null, node.definitions[0].selectionSet);
  }
}

module.exports = GraphQL;
