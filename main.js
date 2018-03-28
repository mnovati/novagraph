const DB = require('./lib/db.js');
const CognitoValidator = require('./lib/cognito.js');
const Constants = require('./lib/constants.js');

class NovaGraph {}

NovaGraph.DB = DB;
NovaGraph.COGNITO = CognitoValidator;
NovaGraph.CONSTANTS = Constants;

module.exports = NovaGraph;
