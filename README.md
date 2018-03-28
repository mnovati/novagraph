# novagraph

See setup folder for MySQL schema

==WHAT IS THIS==
This is a very generic graph storage for user facing applications. You will likely have users
using your system who have profiles or accounts. And those users will interact with users
and objects, and have various relationships to those objects (i.e. edges). 

This also integrates some privacy and permission concepts, so that at a very low level, you 
can ensure that people can only access data they should see, rather than implementing those
rules at a higher level.

Objects have a UUID uniquely identifying them globally. They also have a type (e.g. "profile")
and a JSON encoded data field, which can store whatever serialable key-value pairs you want.

Edges have a type (e.g. "follows"), the ID1 -> ID2 objects that they connect, and some optional
minimal data for future use. 

There are much more sophisticated graph/node-edge storage models, query languages, etc... and 
this doesn't support any of those at this time. This is meant for people who want to get
started quicky with a clean data model for their user facing app.

==GETTING STARTED==

A typical implementation will have the following:

var NovaGraph = require(...);

NovaGraph.DB.init({
  host     : <domain>,
  user     : <user>,
  password : <password>,
  database : <database>,
  ssl      : { ca: fs.readFileSync('./setup/rds-ca-2015-root.pem') } // if using AWS RDS
});
NovaGraph.COGNITO.init({
  region: <aws region>,
  cognitoUserPoolId: <cognito pool>,
  tokenUse: "access",
  tokenExpiration: 3600000
});
NovaGraph.CONSTANTS.setObjectTypes({
  PROFILE: 0
});
NovaGraph.CONSTANTS.setObjectMap({
  O: GObject
});
NovaGraph.CONSTANTS.setEdgeTypes({
  FOLLOW: 0
});
NovaGraph.CONSTANTS.setObjectMap({
  O: GEdge
});

NOTE: for Privacy, you'll need to subclass GObject and GEdge for given types, and implement
appropriate privacy rules. By default everyone can see and do anything.

==USAGE==

You'll like want to verify the identity of the caller. This will return a Viewer object that is
required by all other callsites.

var viewer = NovaGraph.COGNITO.validate(viewer_id_uuid, viewer_cognito_access_token);

This will confirm the viewer is who they say they are.
THIS REQUIRES THE VIEWER'S PROFILE OBJECT - the only object type forced by this module - TO
CONTAIN THE COGNITO UUID IN IT'S DATA, under the key cognito_uuid.

To make DB queries see the DB file, but a sample fetch might look like:
var result = await NovaGraph.DB.getObject(viewer, uuid_to_fetch_object_for);

Objects and edges are wrapped in simple classes called GObject and GEdge. 
