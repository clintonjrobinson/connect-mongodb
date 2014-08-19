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

	var db, server_config, url, auth;

	function getCollection(db, callback) {
		db.collection(options.collection || defaults.collection, function (err, col) {
			if (err) {
        callback(err);
        return;
      }

			collection = col;

      //Set the expiration of this thang. using timed collections
      col.ensureIndex( { lastAccess: 1 }, { expireAfterSeconds: options.expiry || 3600 } , function(err) {
        
      });

			callback();
		});
	}

	function authenticateAndGetCollection(callback) {
		if (options.username && options.password) {
			db.authenticate(options.username, options.password, function () {
				getCollection(db, callback);
			});
		} else {
			getCollection(db, callback);
		}
	}

	if (options.url) {
		url = require('url').parse(options.url);

		if (url.auth) {
			auth = url.auth.split(':', 2);
			options.username = auth[0];
			options.password = auth[1];
		}

		options.db = new mongo.Db(
			url.pathname.replace(/^\//, ''),
			new mongo.Server(url.hostname || defaults.host, parseInt(url.port) || defaults.port),
			{w: -1}
		);
	}

	if (options.server_config) {
		server_config = options.server_config;
		db = new mongo.Db(options.dbname || defaults.dbname, server_config, {w:-1});
	}

	if (options.host) {
		server_config = new mongo.Server(options.host, options.port);
		db = new mongo.Db(options.database, server_config, {w:-1});
	}

	if (options.db) {
		server_config = options.db.serverConfig;
		db = options.db;
	}

	if (!db || !server_config) {
		return callback(Error('You must provide a `db` or `server_config`!'));
	}

	Store.call(this, options);

	if (server_config.connected) {
		authenticateAndGetCollection(callback);
	} else {
		server_config.connect(db, function (err) {
			if (err) callback(Error("Error connecting (" + (err instanceof Error ? err.message : err) + ")"));
			authenticateAndGetCollection(callback);
		})
	}
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
				if (data) {
					cb(null, data.session);
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
		  cb.apply(this, arguments);
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
