const Viewer = require('../classes/Viewer.js');
const Param = require('./Param.js');

class ViewerUtil {

  static async validate(cognito, req) {
    var viewer = await cognito.validate(Param(req).get('token'));
    req.viewer = viewer;
    return viewer;
  }
}

module.exports = ViewerUtil;
