const DB = require('../lib/db.js');
const GEdge = require('./GEdge.js');

class GObjectCreatorWriteEdge extends GEdge {

  async canSee() {
    var [dest, source] = await Promise.all([
      DB.getObject(this.getViewer(), this.getToID()),
      DB.getObject(this.getViewer(), this.getFromID()),
    ]);
    if (!dest || !source) {
      return false;
    }
    var [dest_data, source_data] = await Promise.all([
      dest.getData(),
      source.getData()
    ]);
    return dest_data.creator_id === this.getViewer().getID() ||
      source_data.creator_id === this.getViewer().getID();
  }

  async canCreate() {
    return await this.canSee();
  }

  async canModify() {
    return await this.canSee();
  }
}

module.exports = GObjectCreatorWriteEdge;
