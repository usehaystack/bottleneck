"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
function _iterableToArrayLimit(arr, i) { var _i = null == arr ? null : "undefined" != typeof Symbol && arr[Symbol.iterator] || arr["@@iterator"]; if (null != _i) { var _s, _e, _x, _r, _arr = [], _n = !0, _d = !1; try { if (_x = (_i = _i.call(arr)).next, 0 === i) { if (Object(_i) !== _i) return; _n = !1; } else for (; !(_n = (_s = _x.call(_i)).done) && (_arr.push(_s.value), _arr.length !== i); _n = !0); } catch (err) { _d = !0, _e = err; } finally { try { if (!_n && null != _i.return && (_r = _i.return(), Object(_r) !== _r)) return; } finally { if (_d) throw _e; } } return _arr; } }
function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
var BottleneckError, IORedisConnection, RedisConnection, RedisDatastore, parser;
parser = require("./parser");
BottleneckError = require("./BottleneckError");
RedisConnection = require("./RedisConnection");
IORedisConnection = require("./IORedisConnection");
RedisDatastore = class RedisDatastore {
  constructor(instance, storeOptions, storeInstanceOptions) {
    this.instance = instance;
    this.storeOptions = storeOptions;
    this.originalId = this.instance.id;
    this.clientId = this.instance._randomIndex();
    parser.load(storeInstanceOptions, storeInstanceOptions, this);
    this.clients = {};
    this.capacityPriorityCounters = {};
    this.sharedConnection = this.connection != null;
    if (this.connection == null) {
      this.connection = this.instance.datastore === "redis" ? new RedisConnection({
        Redis: this.Redis,
        clientOptions: this.clientOptions,
        Promise: this.Promise,
        Events: this.instance.Events
      }) : this.instance.datastore === "ioredis" ? new IORedisConnection({
        Redis: this.Redis,
        clientOptions: this.clientOptions,
        clusterNodes: this.clusterNodes,
        Promise: this.Promise,
        Events: this.instance.Events
      }) : void 0;
    }
    this.instance.connection = this.connection;
    this.instance.datastore = this.connection.datastore;
    this.ready = this.connection.ready.then(clients => {
      this.clients = clients;
      return this.runScript("init", this.prepareInitSettings(this.clearDatastore));
    }).then(() => {
      return this.connection.__addLimiter__(this.instance);
    }).then(() => {
      return this.runScript("register_client", [this.instance.queued()]);
    }).then(() => {
      var base;
      if (typeof (base = this.heartbeat = setInterval(() => {
        return this.runScript("heartbeat", []).catch(e => {
          return this.instance.Events.trigger("error", e);
        });
      }, this.heartbeatInterval)).unref === "function") {
        base.unref();
      }
      return this.clients;
    });
  }
  __publish__(message) {
    var _this = this;
    return _asyncToGenerator(function* () {
      var client;
      var _yield$_this$ready = yield _this.ready;
      client = _yield$_this$ready.client;
      return client.publish(_this.instance.channel(), `message:${message.toString()}`);
    })();
  }
  onMessage(channel, message) {
    var _this2 = this;
    return _asyncToGenerator(function* () {
      var capacity, counter, data, drained, e, newCapacity, pos, priorityClient, rawCapacity, type;
      try {
        pos = message.indexOf(":");
        var _ref = [message.slice(0, pos), message.slice(pos + 1)];
        type = _ref[0];
        data = _ref[1];
        if (type === "capacity") {
          return yield _this2.instance._drainAll(data.length > 0 ? ~~data : void 0);
        } else if (type === "capacity-priority") {
          var _data$split = data.split(":");
          var _data$split2 = _slicedToArray(_data$split, 3);
          rawCapacity = _data$split2[0];
          priorityClient = _data$split2[1];
          counter = _data$split2[2];
          capacity = rawCapacity.length > 0 ? ~~rawCapacity : void 0;
          if (priorityClient === _this2.clientId) {
            drained = yield _this2.instance._drainAll(capacity);
            newCapacity = capacity != null ? capacity - (drained || 0) : "";
            return yield _this2.clients.client.publish(_this2.instance.channel(), `capacity-priority:${newCapacity}::${counter}`);
          } else if (priorityClient === "") {
            clearTimeout(_this2.capacityPriorityCounters[counter]);
            delete _this2.capacityPriorityCounters[counter];
            return _this2.instance._drainAll(capacity);
          } else {
            return _this2.capacityPriorityCounters[counter] = setTimeout( /*#__PURE__*/_asyncToGenerator(function* () {
              var e;
              try {
                delete _this2.capacityPriorityCounters[counter];
                yield _this2.runScript("blacklist_client", [priorityClient]);
                return yield _this2.instance._drainAll(capacity);
              } catch (error) {
                e = error;
                return _this2.instance.Events.trigger("error", e);
              }
            }), 1000);
          }
        } else if (type === "message") {
          return _this2.instance.Events.trigger("message", data);
        } else if (type === "blocked") {
          return yield _this2.instance._dropAllQueued();
        }
      } catch (error) {
        e = error;
        return _this2.instance.Events.trigger("error", e);
      }
    })();
  }
  __disconnect__(flush) {
    clearInterval(this.heartbeat);
    if (this.sharedConnection) {
      return this.connection.__removeLimiter__(this.instance);
    } else {
      return this.connection.disconnect(flush);
    }
  }
  runScript(name, args) {
    var _this3 = this;
    return _asyncToGenerator(function* () {
      if (!(name === "init" || name === "register_client")) {
        yield _this3.ready;
      }
      return new _this3.Promise((resolve, reject) => {
        var all_args, arr;
        all_args = [Date.now(), _this3.clientId].concat(args);
        _this3.instance.Events.trigger("debug", `Calling Redis script: ${name}.lua`, all_args);
        arr = _this3.connection.__scriptArgs__(name, _this3.originalId, all_args, function (err, replies) {
          if (err != null) {
            return reject(err);
          }
          return resolve(replies);
        });
        return _this3.connection.__scriptFn__(name)(...arr);
      }).catch(e => {
        console.log('XXXX:', e.message);
        if (e.message === "SETTINGS_KEY_NOT_FOUND") {
          if (name === "heartbeat") {
            return _this3.Promise.resolve();
          } else {
            return _this3.runScript("init", _this3.prepareInitSettings(false)).then(() => {
              return _this3.runScript(name, args);
            });
          }
        } else if (e.message === "UNKNOWN_CLIENT") {
          return _this3.runScript("register_client", [_this3.instance.queued()]).then(() => {
            return _this3.runScript(name, args);
          });
        } else {
          return _this3.Promise.reject(e);
        }
      });
    })();
  }
  prepareArray(arr) {
    var i, len, results, x;
    results = [];
    for (i = 0, len = arr.length; i < len; i++) {
      x = arr[i];
      results.push(x != null ? x.toString() : "");
    }
    return results;
  }
  prepareObject(obj) {
    var arr, k, v;
    arr = [];
    for (k in obj) {
      v = obj[k];
      arr.push(k, v != null ? v.toString() : "");
    }
    return arr;
  }
  prepareInitSettings(clear) {
    var args;
    args = this.prepareObject(Object.assign({}, this.storeOptions, {
      id: this.originalId,
      version: this.instance.version,
      groupTimeout: this.timeout,
      clientTimeout: this.clientTimeout
    }));
    args.unshift(clear ? 1 : 0, this.instance.version);
    return args;
  }
  convertBool(b) {
    return !!b;
  }
  __updateSettings__(options) {
    var _this4 = this;
    return _asyncToGenerator(function* () {
      yield _this4.runScript("update_settings", _this4.prepareObject(options));
      return parser.overwrite(options, options, _this4.storeOptions);
    })();
  }
  __running__() {
    return this.runScript("running", []);
  }
  __queued__() {
    return this.runScript("queued", []);
  }
  __done__() {
    return this.runScript("done", []);
  }
  __groupCheck__() {
    var _this5 = this;
    return _asyncToGenerator(function* () {
      return _this5.convertBool(yield _this5.runScript("group_check", []));
    })();
  }
  __incrementReservoir__(incr) {
    return this.runScript("increment_reservoir", [incr]);
  }
  __currentReservoir__() {
    return this.runScript("current_reservoir", []);
  }
  __check__(weight) {
    var _this6 = this;
    return _asyncToGenerator(function* () {
      return _this6.convertBool(yield _this6.runScript("check", _this6.prepareArray([weight])));
    })();
  }
  __register__(index, weight, expiration) {
    var _this7 = this;
    return _asyncToGenerator(function* () {
      var reservoir, success, wait;
      var _yield$_this7$runScri = yield _this7.runScript("register", _this7.prepareArray([index, weight, expiration]));
      var _yield$_this7$runScri2 = _slicedToArray(_yield$_this7$runScri, 3);
      success = _yield$_this7$runScri2[0];
      wait = _yield$_this7$runScri2[1];
      reservoir = _yield$_this7$runScri2[2];
      return {
        success: _this7.convertBool(success),
        wait,
        reservoir
      };
    })();
  }
  __submit__(queueLength, weight) {
    var _this8 = this;
    return _asyncToGenerator(function* () {
      var blocked, e, maxConcurrent, overweight, reachedHWM, strategy;
      try {
        var _yield$_this8$runScri = yield _this8.runScript("submit", _this8.prepareArray([queueLength, weight]));
        var _yield$_this8$runScri2 = _slicedToArray(_yield$_this8$runScri, 3);
        reachedHWM = _yield$_this8$runScri2[0];
        blocked = _yield$_this8$runScri2[1];
        strategy = _yield$_this8$runScri2[2];
        return {
          reachedHWM: _this8.convertBool(reachedHWM),
          blocked: _this8.convertBool(blocked),
          strategy
        };
      } catch (error) {
        e = error;
        if (e.message.indexOf("OVERWEIGHT") === 0) {
          var _e$message$split = e.message.split(":");
          var _e$message$split2 = _slicedToArray(_e$message$split, 3);
          overweight = _e$message$split2[0];
          weight = _e$message$split2[1];
          maxConcurrent = _e$message$split2[2];
          throw new BottleneckError(`Impossible to add a job having a weight of ${weight} to a limiter having a maxConcurrent setting of ${maxConcurrent}`);
        } else {
          throw e;
        }
      }
    })();
  }
  __free__(index, weight) {
    var _this9 = this;
    return _asyncToGenerator(function* () {
      var running;
      running = yield _this9.runScript("free", _this9.prepareArray([index]));
      return {
        running
      };
    })();
  }
};
module.exports = RedisDatastore;