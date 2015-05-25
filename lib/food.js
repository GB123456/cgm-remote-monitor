'use strict';

function storage (collection, storage) {
   var ObjectID = require('mongodb').ObjectID;

  function create (obj, fn) {
    obj.created_at = (new Date( )).toISOString( );
    api().insert(obj, function (err, doc) {
      fn(null, doc);
    });
  }

  function save (obj, fn) {
    obj._id = new ObjectID(obj._id);
    obj.created_at = (new Date( )).toISOString( );
    api().save(obj, function (err, doc) {
      fn(err, doc);
    });
  }

  function list (fn) {
    return api( ).find({ }).toArray(fn);
  }
  
  function listquickpicks (fn) {
    return api( ).find({ $and: [ { "type": "quickpick"} , { "hidden" : false } ] }).sort({"position": 1}).toArray(fn);
  }
  
  function listregular (fn) {
    return api( ).find( { "type": "food"} ).toArray(fn);
  }
  
  function remove (_id, fn) {
    return api( ).remove({ "_id": new ObjectID(_id) }, fn);
  }



  function api () {
    return storage.pool.db.collection(collection);
  }
  
  api.list = list;
  api.listquickpicks = listquickpicks;
  api.listregular = listregular;
  api.create = create;
  api.save = save;
  api.remove = remove;
  api.indexedFields = indexedFields;
  return api;
}

var indexedFields = ['type','position','hidden'];

module.exports = storage;