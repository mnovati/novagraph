const GObject = require('../classes/GObject.js');
const GEdge = require('../classes/GEdge.js');
const GAllowAllRule = require('../classes/GAllowAllRule.js');
const GDenyAllRule = require('../classes/GDenyAllRule.js');

class Constants {

  static setObjects(list) {
    this.Objects = list;
  }

  static setEdges(list) {
    this.Edges = list;
  }

	static getObjectTypeFromName(name) {
    name = (name === 'viewer') ? 'profile' : name;
		for (var key in this.Objects) {
			if (this.Objects[key].api_name === name) {
				return parseInt(key);
			}
		}
		throw new Error('Could not lookup object type for ' + name);
	}

	static getEdgeTypeFromName(type, name) {
		for (var key in this.Edges) {
			if (this.Edges[key].api_name === name && this.Edges[key].from_type.includes(type)) {
				return parseInt(key);
			}
		}
		throw new Error('Could not lookup edge type for ' + name + ', object type: ' + type);
	}

	static getReverseEdgeTypeFromName(type, name) {
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

  static getObject(type) {
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
      throw new Error('Object type not found in config: ' + type);
    }
    return this.Objects[type];
  }

  static getEdge(type) {
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
      throw new Error('Edge type not found in config: ' + type);
    }
    return this.Edges[type];
  }

  static getObjectInstance(viewer, raw_object) {
    return this.Objects[raw_object.type]
      ? new this.Objects[raw_object.type].instance(viewer, raw_object)
      : new GObject(viewer, raw_object);
  }

  static getEdgeInstance(viewer, raw_edge) {
    return this.Edges[raw_edge.type]
      ? new this.Edges[raw_edge.type].instance(viewer, raw_edge)
      : new GEdge(viewer, raw_edge);
  }
}

Constants.Status = {
  VISIBLE: 0,
  DELETED: 1
}

Constants.Objects = {
  0: {
    name: 'Profile',
    instance: GObject,
    index: [ 'name' ]
  }
};

Constants.Edges = {
  /**
   * 0: {
   *  name: 'ProfileToFollow',
   *  instance: GEdge,
   *  from_type: [0],
   *  to_type: [0]
   * }
   */
}

Constants.ROOT_EDGE = 65534;
Constants.ROOT_OBJECT = 65534;
Constants.COGNITO_EDGE = 65535;
Constants.MAX_EDGE = 65535;
Constants.MAX_OBJECT = 65535;

module.exports = Constants;
