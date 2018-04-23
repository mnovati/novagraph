const Constants = require('../lib/constants.js');
const DB = require('../lib/db.js');

const GObject = require('./GObject.js');
const ReadAllViewer = require('./ReadAllViewer.js');

class GViewerEdgeWriteObject extends GObject {

  async canSee() {
    if (this.getViewer().getID() === this.getID()) {
      return true;
    }
    var data = await this.getData();
    if (this.getViewer().getID() === data.creator_id) {
      return true;
    }
    var edges = Constants.Objects[this.getType()].instance_config;
    if (!Array.isArray(edges)) {
      throw new Error('Instance config for type ' + this.getType() + ' must be an array');
    }
    var result = await Promise.all(edges.forEach(async (e) => {
      var edge = await DB.getSingleEdge(new ReadAllViewer(0), this.getID(), e, this.getViewer().getID());
      return !!edge;
    }));
    return result.filter(Boolean).length > 0;
  }

  async canCreate() {
    return true;
  }

  async canModify() {
    return await this.canSee();
  }
}

module.exports = GViewerEdgeWriteObject;
