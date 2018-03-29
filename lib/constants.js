const GObject = require('../classes/GObject.js');
const GEdge = require('../classes/GEdge.js');

class Constants {

  static setObjectTypes(list) {
    this.Objects = list;
  }

  static setObjectMap(map) {
    this.objectMap = map;
  }

  static setEdgeTypes(list) {
    this.Edges = list;
  }

  static setEdgeMap(map) {
    this.edgeMap = map;
  }

  static setStatusTypes(list) {
    this.Status = list;
  }

  static getObjectInstance(viewer, raw_object) {
    return this.objectMap[raw_object.type]
      ? new this.objectMap[raw_object.type](viewer, raw_object)
      : new GObject(viewer, raw_object);
  }

  static getEdgeInstance(viewer, raw_edge) {
    return this.edgeMap[raw_edge.type]
      ? new this.edgeMap[raw_edge.type](viewer, raw_edge)
      : new GEdge(viewer, raw_edge);
  }
}

Constants.objectMap = null;
Constants.edgeMap = null;

Constants.Status = {
  VISIBLE: 0,
  DELETED: 1
}

Constants.Objects = {
  PROFILE: 0,
};

Constants.Edges = {
  // e.g.
  // FOLLOWS: 0,
}

module.exports = Constants;
