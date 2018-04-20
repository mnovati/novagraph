const GEdge = require('./GEdge.js');

class GDestObjectCreatorWriteEdge extends GEdge {

  async canSee() {
    var object = await DB.getObject(this.getViewer(), this.getToID());
    return !!object;
  }

  async canCreate() {
    var [dest, source] = await Promise.all([
      DB.getObject(this.getViewer(), this.getToID()),
      DB.getObject(this.getViewer(), this.getFromID()),
    ]);
    if (!dest || !source) {
      return false;
    }
    return dest.getData().creator_id === this.getViewer().getID() ||
      source.getData().creator_id === this.getViewer().getID();
  }

  async canModify() {
    return await this.canCreate();
  }
}

module.exports = GDestObjectCreatorWriteEdge;
