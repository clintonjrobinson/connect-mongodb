/*!
 * Connect - Mongodb
 * Copyright(c) 2010 Vladimir Dronnikov <dronnikov@gmail.com>
 * Mantained by Pau Ramon Revilla <masylum@gmail.com>
 * MIT Licensed
 *
 * Forked by Sascea clinton.robinson@sascea.com
 */

var WAIT_TIME = 100; //ms

var Store = require('express-session').Store;
var mongo = require('mongodb');
var MongoClient = require('mongodb').MongoClient;
var collection = null;
var defaults = {host: '127.0.0.1', port: 27017, dbname: 'dev', collection: 'Session', expiry: 3600 };

function wrapCallback(callback) {
	callback = typeof(callback) === 'function' ? callback : function () { };
	return callback;
}

/**
 * Initialize MongoStore with the given `options`.
 *
 * @param {Object} options
 * @param {Function} callback
 * @api public
 */
var MONGOSTORE = module.exports = function MongoStore(options, callback) {
	options = options || {};

	callback = wrapCallback(callback);

	var db, url;

	url = 'mongodb://' + options.host + ':' + options.port + '/' + options.database;

	MongoClient.connect(url, function(err, _db) {
		if (err) {
			callback(err);
			return;
		}

		db = _db;
		collection = db.collection(options.collection || defaults.collection);

		//Set the expiration of this thang. using timed collections
		collection.ensureIndex( { lastAccess: 1 }, { expireAfterSeconds: options.expiry || 3600 } , function(err) {
		});

		callback();
	});


	Store.call(this, options);
};

MONGOSTORE.prototype.__proto__ = Store.prototype;

/**
 * Attempt to fetch session by the given `sid`.
 *
 * We are also going to update the lastAccess timestamp when we do this
 *
 * @param {String} sid
 * @param {Function} cb
 * @api public
 */
MONGOSTORE.prototype.get = getSession = function (sid, cb) {
	//Check to see if collection exists yet
	//if not we better wait for a bit.
	if (!collection) {
		setTimeout(function() {
      getSession(sid, cb);
    }, WAIT_TIME);

		return;
	}

	cb = wrapCallback(cb);

	collection.findAndModify(
		{_id: sid},
		['_id'],
		{$set: {lastAccess: new Date()}},
		function (err, data) {
			try {
				if (data && data.value) {
					cb(null, data.value.session);
				} else {
					cb();
				}
			} catch (exc) {
				cb(exc);
			}
		});
};


/**
 * Commit the given `sess` object associated with the given `sid`.
 *
 * @param {String} sid
 * @param {Session} sess
 * @param {Function} cb
 * @api public
 */
MONGOSTORE.prototype.set = setSession = function (sid, sess, cb) {
	//Check to see if collection exists yet
	//if not we better wait for a bit.
	if (!collection) {
    setTimeout(function () {
      setSession(sid, sess, cb);
    }, WAIT_TIME);
    return;
  }

	cb = wrapCallback(cb);

	var update = {$set: {session: sess, lastAccess: new Date()}};

	collection.findAndModify(
    {_id: sid},
    ['_id'],
    update,
    {upsert: true, new: true},
    function (err, data) {
		  cb.apply(this, [err, data.value]);
	  }
  );
};

/**
 * Destroy the session associated with the given `sid`.
 *
 * @param {String} sid
 * @api public
 */
MONGOSTORE.prototype.destroy = function (sid, cb) {
	collection.remove({_id: sid}, wrapCallback(cb));
};

/**
 * Fetch number of sessions.
 *
 * @param {Function} cb
 * @api public
 */
MONGOSTORE.prototype.length = function (cb) {
	collection.count({}, wrapCallback(cb));
};

/**
 * Clear all sessions.
 *
 * @param {Function} cb
 * @api public
 */
MONGOSTORE.prototype.clear = function (cb) {
	collection.drop(wrapCallback(cb));
};

/**
 * Get the collection
 *
 * @param
 * @api public
 */
MONGOSTORE.prototype.getCollection = function () {
	return collection;
};
