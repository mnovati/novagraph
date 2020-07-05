const GEdge = require('./GEdge.js');

class GEdgePlaceholder extends GEdge {

  getType() {
    return -1;
  }

  async getAPIType() {
    return this.edge.api_type;
  }
}

module.exports = GEdgePlaceholder;
