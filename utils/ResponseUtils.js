class ResponseUtils {

  constructor(res, DB) {
    this._res = res;
    this._DB = DB;
  }
  
  async sendResponseError(error) {
    await this.sendResponse({}, [], { error: error });
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
        edge.from_type = object.getAPIType();
				edge.type = (object ? object.getAPIType() : 'null') + '/' + this._DB.Constants.Edges[edge.type].api_name;
				return edge;
			}));
			out.edge_counts = out.edge_counts.filter(Boolean);
		}
		out.objects = raw_objects;
		out.edges = raw_edges.filter(Boolean);
		this._res.send(out);
		for (var ii = 0; ii < ResponseUtils._cleanup.length; ii++) {
			await ResponseUtils._cleanup[ii](this._DB);
		}
		this._res.end();
	}

  async sendResponseGraphQL(objects, edges, edge_counts, tld_ids) {
		edges = edges || [];
    
    var edges_by_id = {};
    var edges_count_by_id = {};
    var skip = {};
    await Promise.all(edges.filter(Boolean).map(async (edge) => {
      var raw = await edge.getRaw();
      raw.type = await edge.getAPIType();
      if (!(edge.getFromID() in edges_by_id)) {
        edges_by_id[edge.getFromID()] = [];
      }
      edges_by_id[edge.getFromID()].push(raw);
    }));
    edge_counts.filter(Boolean).map(edge => {
      if (!(edge.from_id in edges_count_by_id)) {
        edges_count_by_id[edge.from_id] = [];
      }
      edges_count_by_id[edge.from_id].push(edge);
    });

    const flattenObject = async o => {
      if (!o) {
        return null;
      }
      var raw = await o.getRaw();
      raw.type = o.getAPIType();
      var files = raw.data.files;
      if (files && files.length > 0) {
        for (var ii = 0; ii < files.length; ii++) {
          raw.data.files[ii].path = this._DB.getSignedS3URL(files[ii].id);
        }
      }
      if (o.getID() in edges_by_id && !(o.getID() in skip)) {
        skip[o.getID()] = true;
        await Promise.all(edges_by_id[o.getID()].map(async edge => {
          if (!(edge.type in raw)) {
            raw[edge.type] = [];
          }
          var child = await flattenObject(objects[edge.to_id]);
          if (!child) {
            child = { id: edge.to_id };
          }
          child.edge = edge;
          raw[edge.type].push(child);
        }));
        (edges_count_by_id[o.getID()] || []).forEach(edge => {
          var edge_type = `${o.getAPIType()}/${this._DB.Constants.Edges[edge.type].api_name}/count`;
          edge.type = this._DB.Constants.Edges[edge.type].api_name;
          raw[edge_type] = edge;
        });
      }
      return raw;
    };

    var out = {};
		await Promise.all(tld_ids.map(async object_id => {
      var raw = await flattenObject(objects[object_id]);
      if (!raw) {
        return;
      }
      if (!(raw.type in out)) {
        out[raw.type] = [];
      }
      out[raw.type].push(raw);
		}));

		this._res.send({ data: out });
		for (var ii = 0; ii < ResponseUtils._cleanup.length; ii++) {
			await ResponseUtils._cleanup[ii](this._DB);
		}
		this._res.end();
	}

  static addExpansionCallback(fn) {
    ResponseUtils._expand.push(fn);
  }

  static addCleanupCallback(fn) {
    ResponseUtils._cleanup.push(fn);
  }
}

ResponseUtils._expand = [];
ResponseUtils._cleanup = [];

module.exports = ResponseUtils;
