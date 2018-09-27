
class ResponseUtils {

  constructor(res, DB) {
    this._res = res;
    this._DB = DB;
  }

  async sendResponseSingle(object, additional) {
    var objects = {};
    if (object !== null) {
      objects[object.getID()] = object;
    }
    await this.sendResponse(objects, [], additional);
  }

	async sendResponse(objects, edges, additional) {
		edges = edges || [];
		additional = additional || {};

		for (var ii = 0; ii < ResponseUtils._expand.length; ii++) {
			[objects, edges] = await ResponseUtils._expand[ii](this._DB, objects, edges);
		}

		var out = additional;

		var raw_objects = {};
		await Promise.all(Object.keys(objects).map(async (object_id) => {
			if (objects[object_id] === null) {
				raw_objects[object_id] = { id: object_id };
			} else {
				var raw = await objects[object_id].getRaw();
				raw.type = objects[object_id].getAPIType();
				var files = raw.data.files;
				if (files && files.length > 0) {
					for (var ii = 0; ii < files.length; ii++) {
						raw.data.files[ii].path = this._DB.getSignedS3URL(files[ii].id);
					}
				}
				raw_objects[raw.id] = raw;
			}
		}));

		var dedup = {};
		var raw_edges = await Promise.all(edges.filter(Boolean).map(async (edge) => {
			var key = edge.getFromID()+edge.getType()+edge.getToID();
			if (key in dedup) {
				return null;
			}
			dedup[key] = true;
			var raw = await edge.getRaw();
			raw.type = await edge.getAPIType();
			return raw;
		}));
		if ('edge_counts' in out) {
			dedup = {}
			var read_all_viewer = Object.values(objects)[0].getViewer().getReadAllViewer();
			out.edge_counts = await Promise.all(out.edge_counts.filter(Boolean).map(async (edge) => {
				var key = edge.from_id+edge.type;
				if (key in dedup) {
					return null;
				}
				dedup[key] = true;
				var object = await this._DB.getObject(read_all_viewer, edge.from_id);
				edge = Object.assign({}, edge);
				edge.type = (object ? object.getAPIType() : 'null') + '/' + NovaGraph.CONSTANTS.Edges[edge.type].api_name;
				return edge;
			}));
			out.edge_counts = out.edge_counts.filter(Boolean);
		}
		out.objects = raw_objects;
		out.edges = raw_edges.filter(Boolean);
		this._res.send(out);
		this._res.end();
	}

  static addExpansionCallback(fn) {
    ResponseUtils._expand.push(fn);
  }
}

ResponseUtils._expand = [];

module.exports = function (res, DB) {
  return new ResponseUtils(res, DB);
}
