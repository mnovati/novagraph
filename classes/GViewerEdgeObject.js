const Constants = require('../lib/constants.js');
const DB = require('../lib/db.js');

const GObject = require('./GObject.js');
const ReadAllViewer = require('./ReadAllViewer.js');

class GViewerEdgeObject extends GObject {

  async _canSee() {
    if (await this._isViewerOrCreator()) {
      return true;
    }
    return await this._viewerEdgeConnected();
  }

  async _canCreate() {
    return true;
  }

  async _canModify() {
    return await this.canSee();
  }

  async _isViewerOrCreator() {
    if (this.getViewer().getID() === this.getID()) {
      return true;
    }
    var data = await this.getData();
    if (this.getViewer().getID() === data.creator_id) {
      return true;
    }
  }

  async _viewerEdgeConnected() {
    var edges = Constants.Objects[this.getType()].instance_config;
    if (!Array.isArray(edges)) {
      throw new Error('Instance config for type ' + this.getType() + ' must be an array');
    }
    var result = await Promise.all(edges.map(async (e) => {
      var edge = await DB.getSingleEdge(new ReadAllViewer(0), this.getID(), e, this.getViewer().getID());
      return !!edge;
    }));
    return result.filter(Boolean).length > 0;
  }

}

module.exports = GViewerEdgeObject;

