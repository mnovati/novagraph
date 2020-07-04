# NovaGraph

##Summary and Purpose

NovaGraph is a work in progress project trying to make it as fast as possible to setup a scalable, robust, flexible, and privacy-aware data model for almost any application.

##Features

1. graph storage abstraction (objects w/ unique IDs and edges between them)
2. low-level privacy and permissions rules, declerative style
3. data model is meant to scale indefinitely
4. queries based on GraphQL's query language

##Limitations

1. this project is an early work in progress/proof of concept
2. only supports a single SQL DB
3. only supports AWS Cognito for authentication
4. there is little to no documentation for how to use a bunch of highly experimental features. it's not usable with help from someone who has set it up before.
5. the APIs will frequently change and not be backwards compatible

##What Exactly is This?
NovaGraph a very generic graph storage for user facing applications. Graph data models can be used for almost any application. An Object is anything with a unique ID and a dictionary of data. An Edge is conection of a certain type between two Objects. For example, a user Profile with a name and other fields, would be an Object, and a friend edge between them would be an Edge.

At a storage level, we essentially have a giant dictionary of all Objects, keyed off of their unique IDs. So any key-value/document store model and work with NovaGraph in theory. 

This also integrates some privacy and permission concepts, so that at a very low level, you can ensure that people can only access data they should see, rather than implementing those rules at a higher level. There are no limits to the complexity of privacy rules, making the system both easy to get going with, but usable for arbitrarily complex situations.

Objects have a UUID uniquely identifying them globally. They also have a type (e.g. "profile") and a JSON encoded data field, which can store whatever serialable key-value pairs you want.

Edges have a type (e.g. "follows"), the ID1 -> ID2 objects that they connect, and some optional minimal data for future use. 

###Getting Started

1. checkout this code a git submodule in your project
2. define some objects in a helper file, like this:

    module.exports = {
    	0: {
    		name: 'Profile',
    		instance: GObject,
    		types: {
    			name: new GStringType(),
    		},
    		field_privacy: {
    			name: {
    				cansee: [new GAllowAllRule()],
    				canmodify: [new GAllowAllRule()],
    			},
    		},
    		privacy: {
    			cansee: [new GAllowAllRule()],
    			canmodify: [new GAllowViewerObjectRule()],
    			cancreate: [new GAllowAllRule()],
    		},
    		index: ['name'],
    		unique_index: ['name'],
    		text_index: {
    			0: ['name'],
    		},
    		root_id: null,
    		api_name: 'profile',
      },
    }

3. define some edges in a helper file, like this:

	  module.exports = {
    	0: {
    		name: 'Friends',
    		instance: GEdge,
    		privacy: {
    			cansee: [new GAllowAllRule()],
    			canmodify: [new GAllowViewerObjectRule()],
    			cancreate: [new GAllowAllRule()],
    		},
				from_type: [0],
				to_type: [0],
				reverse_edge: 'self'
    		api_name: 'friend',
      },
    }

3. create a new initialization helper file that looks something like this:

   const NovaGraph = require('../lib/novagraph/index.js');
   const KEYS = require('./keys.js');
   const OBJECTS = require('./objects.js');
   const EDGES = require('./edges.js');
   
   var instance = null;
   
   module.exports = function() {
     if (instance !== null) {
       return instance;
     }
     instance = {
       DB: new NovaGraph.DB({
         client: 'mysql',
         connection: {
           host     : KEYS.DB_HOST,
           user     : KEYS.DB_USER,
           password : KEYS.DB_PASSWORD,
           database : KEYS.DB_NAME,
           ssl      : { ca: fs.readFileSync('./lib/novagraph/setup/rds-ca-2019-root.pem') },
           connectionLimit: 20,
         },
         aws: {
           bucket: KEYS.S3_BUCKET,
           accessKey: KEYS.S3_ACCESS,
           secretKey: KEYS.S3_SECRET,
           region: KEYS.S3_REGION,
           snsRegion: KEYS.SNS_REGION,
         },
       }),
       Cognito: new NovaGraph.Cognito({
         region: KEYS.COGNITO_REGION,
         cognitoUserPoolId: KEYS.COGNITO_POOL,
         cognitoIdentityPoolId: KEYS.COGNITO_IDENTITY,
       }),
       Constants: new NovaGraph.Constants({
         objects: OBJECTS,
         edges: EDGES,
         status: {
           VISIBLE: 0,
           DELETED: 1,
         },
       }),
       Error: NovaGraph.Error,
     };
     return instance;
   };

4. import your initialization helper and instantiate it
