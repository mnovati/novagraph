const Viewer = require('../classes/Viewer.js');
const Param = require('./Param.js');

class ViewerUtil {

  static async validate(ng, req) {
    var viewer = await ng.COGNITO.validate(Param(req).get('token'));
    req.viewer = viewer;
    return viewer;
  }
}

module.exports = ViewerUtil;
