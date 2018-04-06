const GObject = require('../classes/GObject.js');
const GEdge = require('../classes/GEdge.js');

class Constants {

  static setObjects(list) {
    this.Objects = list;
  }

  static setEdges(list) {
    this.Edges = list;
  }

  static getObjectInstance(viewer, raw_object) {
    return new this.Objects[raw_object.type].instance(viewer, raw_object);
  }

  static getEdgeInstance(viewer, raw_edge) {
    return new this.Edges[raw_edge.type].instance(viewer, raw_edge);
  }
}

Constants.Status = {
  VISIBLE: 0,
  DELETED: 1
}

Constants.Objects = {
  0: {
    name: 'Profile',
    instance: GObject
  }
};

Constants.Edges = {
  /**
   * 0: {
   *  name: 'ProfileToFollow',
   *  instance: GEdge,
   *  id1_type: [0],
   *  id2_type: [0]
   * }
   */
}

module.exports = Constants;
