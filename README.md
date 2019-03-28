# novagraph

==SUMMARY OF FEATURES==
1) graph storage abstraction (objects/entities and edges/associations between them) 
2) built in privacy rules to protect all data within the abstraction
3) data model scales indefinitely in theory to any amount of data
4) utility functions to hook into a node.js server, including GraphQL-like query engine

==ASSUMPTIONS==

0) code is rough around the edges and not super well architected to support quick iteration
1) only supports single DB SQL backend
2) only supports AWS Cognito User Pool AND/OR Identity Pool for authentication
3) only supports node.js/JS server integration
4) ready to be used in production

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

A typical implementation will be ROUGHLY the following (more details to get it working, but very high level). This is meant to help you understand the abstraction and is not copy paste code.

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

NovaGraph.CONSTANTS.setObjects({
  0: {
      name: 'Profile',
      instance: GObject,
      privacy: {
        cansee: [new GAllowAllRule()],
        canmodify: [new GAllowViewerObjectRule()],
        cancreate: [new GDenyAllRule()],
      },
      index: [], // index certain field
      unique_index: ['cognito_username'], // indexes that are unique
      text_index: [
        0: ['field_name'], // full text search indexes
      ],
      geo_index: ['field_name'], // lat lng will be indexed for geo based queries
    },
 });
 NovaGraph.CONSTANTS.setEdges({
   0: {
      name: 'ProfileToFriend',
      instance: GEdge,
      privacy: {
        cansee: [new GAllowAllRule],
        canmodify: [new GAllowViewerEdgeRule(SOURCE)],
        cancreate: [new GAllowViewerEdgeRule(SOURCE)],
      },
      from_type: [0],
      to_type: [0],
      reverse_edge: 'self',
   },
});


NOTE: Some privacy rules are built in, others you can write easily in your own code. 

==USAGE==

You'll like want to verify the identity of the caller. This will return a Viewer object that is
required by all other callsites.

var viewer = await ViewerUtil.validate(new Cognito(DB), req);

This will confirm the viewer is who they say they are by looking at the 'token' field in the headers of the request.
THIS REQUIRES THE VIEWER'S PROFILE OBJECT - the only object type forced by this module - TO
CONTAIN THE COGNITO UUID IN IT'S DATA, under the key cognito_uuid. If you create a profile using the code in NovaGraph, this will be done and protected for you.

To make DB queries see the DB file, but a sample fetch might look like:
var result = await NovaGraph.DB.getObject(viewer, uuid_to_fetch_object_for);

Objects and edges are wrapped in simple classes called GObject and GEdge. 
