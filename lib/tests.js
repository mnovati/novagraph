const Viewer = require('../classes/Viewer.js');
const Constants = require('./constants.js');
const uuidv1 = require('uuid/v1');

(async () => {
  var viewer = new Viewer(uuidv1());
  viewer.setCache(viewer.getID(), {
    id: viewer.getID(),
    type: 0,
    data: { creator_id: viewer.getID() }
  });
  for (var id in Constants.Objects) {
    var current = Constants.getObjectInstance(viewer, {
      id: uuidv1(),
      type: id,
      data: { creator_id: viewer.getID() }
    });
    var raw = await current.getRaw();
    viewer.setCache(current.getID(), raw);
    await current.canSee();
    await current.canModify();
    await current.canCreate();
    current = Constants.getObjectInstance(viewer, {
      id: uuidv1(),
      type: id,
      data: { creator_id: uuidv1() }
    });
    raw = await current.getRaw();
    viewer.setCache(current.getID(), raw);
    await current.canSee();
    await current.canModify();
    await current.canCreate();
  }
  for (var id in Constants.Edges) {
    var current = Constants.getEdgeInstance(viewer, {
      type: id,
      from_id: Constants.Edges.from_types.includes(0) ? viewer.getID() : uuidv1(),
      to_id: Constants.Edges.to_types.includes(0) ? viewer.getID() : uuidv1(),
    });
    raw = await current.getRaw();
    viewer.setCache(current.getFromID()+':'+id+':'+current.getToID(), raw);
    await current.canSee();
    await current.canModify();
    await current.canCreate();
  }
  return null;
})().then(r => {
  console.log(r);
}).catch(e => {
  console.error(e);
})

