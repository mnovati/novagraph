const NError = require('./error.js');

const GObject = require('../classes/GObject.js');
const GEdge = require('../classes/GEdge.js');
const GAllowAllRule = require('../classes/GAllowAllRule.js');
const GDenyAllRule = require('../classes/GDenyAllRule.js');

class Constants {

  constructor(config) {
    this.Objects = config.objects || {};
    this.Edges = config.edges || {};
    this.Status = config.status || {
      VISIBLE: 0,
      DELETED: 1
    };
  }
    
	getObjectTypeFromName(name) {
    name = (name === 'viewer') ? 'profile' : name;
		for (var key in this.Objects) {
			if (this.Objects[key].api_name === name) {
				return parseInt(key);
			}
		}
		throw NError.normal('Could not lookup object type', { type: name });
	}

	getEdgeTypeFromName(type, name) {
		for (var key in this.Edges) {
			if (this.Edges[key].api_name === name && this.Edges[key].from_type.includes(type)) {
				return parseInt(key);
			}
		}
		throw NError.normal('Could not lookup edge type', { type: name, object_type: type });
	}

	getReverseEdgeTypeFromName(type, name) {
		var key = this.getEdgeTypeFromName(type, name);
		if ('reverse_edge' in this.Edges[key]) {
			if (this.Edges[key].reverse_edge === 'self') {
				return parseInt(key);
			} else {
				return parseInt(this.Edges[key].reverse_edge);
			}
		}
		return null;
	}

  getObject(type) {
    if (type === this.ROOT_OBJECT) {
      return {
        name: 'Root',
        instance: GObject,
        privacy: {
          cansee: [new GAllowAllRule()],
          canmodify: [new GDenyAllRule()],
          cancreate: [new GDenyAllRule()]
        }
      };
    }
    if (!(type in this.Objects)) {
      throw NError.normal('Object type not found in config', { type: type });
    }
    return this.Objects[type];
  }

  getEdge(type) {
    if (type === this.ROOT_EDGE) {
      return {
        name: 'RootToObject',
        instance: GEdge,
        from_type: [this.ROOT_OBJECT],
        to_type: [],
        privacy: {
          cansee: [new GAllowAllRule()],
          canmodify: [new GDenyAllRule()],
          cancreate: [new GDenyAllRule()]
        }
      };
    }
    if (type === this.COGNITO_EDGE) {
      return {
        name: 'CognitoToProfile',
        instance: GEdge,
        from_type: [],
        to_type: [0],
        privacy: {
          cansee: [new GDenyAllRule()],
          canmodify: [new GDenyAllRule()],
          cancreate: [new GDenyAllRule()]
        }
      };
    }
    if (!(type in this.Edges)) {
      throw NError.normal('Edge type not found in config', { type: type });
    }
    return this.Edges[type];
  }

  getObjectInstance(viewer, raw_object) {
    return this.Objects[raw_object.type]
      ? new this.Objects[raw_object.type].instance(viewer, raw_object)
      : new GObject(viewer, raw_object);
  }

  getEdgeInstance(viewer, raw_edge) {
    return this.Edges[raw_edge.type]
      ? new this.Edges[raw_edge.type].instance(viewer, raw_edge)
      : new GEdge(viewer, raw_edge);
  }
}

Constants.ROOT_EDGE = 65534;
Constants.ROOT_OBJECT = 65534;
Constants.COGNITO_EDGE = 65535;
Constants.MAX_EDGE = 65535;
Constants.MAX_OBJECT = 65535;

module.exports = Constants;
