const DB = require('../lib/db.js');
const GEdge = require('./GEdge.js');

class GSourceObjectCreatorWriteEdge extends GEdge {

  async _canSeeCustom() {
    var object = await DB.getObject(this.getViewer(), this.getFromID());
    return !!object;
  }

  async _canCreateCustom() {
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

  async _canModifyCustom() {
    return await this.canCreate();
  }
}

module.exports = GSourceObjectCreatorWriteEdge;
