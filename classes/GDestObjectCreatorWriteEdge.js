const DB = require('../lib/db.js');
const GEdge = require('./GEdge.js');

class GDestObjectCreatorWriteEdge extends GEdge {

  async _canSee() {
    var object = await DB.getObject(this.getViewer(), this.getToID());
    return !!object;
  }

  async _canCreate() {
    var [dest, source] = await Promise.all([
      DB.getObject(this.getViewer(), this.getToID()),
      DB.getObject(this.getViewer(), this.getFromID()),
    ]);
    if (!dest || !source) {
      return false;
    }
    var [dest_data, source_data] = await Promise.all([dest.getData(), source.getData()]);
    return dest_data.creator_id === this.getViewer().getID() ||
      source_data.creator_id === this.getViewer().getID();
  }

  async _canModify() {
    return await this.canCreate();
  }
}

module.exports = GDestObjectCreatorWriteEdge;
