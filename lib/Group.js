"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
function _iterableToArrayLimit(arr, i) { var _i = null == arr ? null : "undefined" != typeof Symbol && arr[Symbol.iterator] || arr["@@iterator"]; if (null != _i) { var _s, _e, _x, _r, _arr = [], _n = !0, _d = !1; try { if (_x = (_i = _i.call(arr)).next, 0 === i) { if (Object(_i) !== _i) return; _n = !1; } else for (; !(_n = (_s = _x.call(_i)).done) && (_arr.push(_s.value), _arr.length !== i); _n = !0); } catch (err) { _d = !0, _e = err; } finally { try { if (!_n && null != _i.return && (_r = _i.return(), Object(_r) !== _r)) return; } finally { if (_d) throw _e; } } return _arr; } }
function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
var Events, Group, IORedisConnection, RedisConnection, Scripts, parser;
parser = require("./parser");
Events = require("./Events");
RedisConnection = require("./RedisConnection");
IORedisConnection = require("./IORedisConnection");
Scripts = require("./Scripts");
Group = function () {
  class Group {
    constructor(limiterOptions = {}) {
      this.deleteKey = this.deleteKey.bind(this);
      this.limiterOptions = limiterOptions;
      parser.load(this.limiterOptions, this.defaults, this);
      this.Events = new Events(this);
      this.instances = {};
      this.Bottleneck = require("./Bottleneck");
      this._startAutoCleanup();
      this.sharedConnection = this.connection != null;
      if (this.connection == null) {
        if (this.limiterOptions.datastore === "redis") {
          this.connection = new RedisConnection(Object.assign({}, this.limiterOptions, {
            Events: this.Events
          }));
        } else if (this.limiterOptions.datastore === "ioredis") {
          this.connection = new IORedisConnection(Object.assign({}, this.limiterOptions, {
            Events: this.Events
          }));
        }
      }
    }
    key(key = "") {
      var ref;
      return (ref = this.instances[key]) != null ? ref : (() => {
        var limiter;
        limiter = this.instances[key] = new this.Bottleneck(Object.assign(this.limiterOptions, {
          id: `${this.id}-${key}`,
          timeout: this.timeout,
          connection: this.connection
        }));
        this.Events.trigger("created", limiter, key);
        return limiter;
      })();
    }
    deleteKey(key = "") {
      var _this = this;
      return _asyncToGenerator(function* () {
        var deleted, instance;
        instance = _this.instances[key];
        if (_this.connection) {
          deleted = yield _this.connection.__runCommand__(['del', ...Scripts.allKeys(`${_this.id}-${key}`)]);
        }
        if (instance != null) {
          delete _this.instances[key];
          yield instance.disconnect();
        }
        return instance != null || deleted > 0;
      })();
    }
    limiters() {
      var k, ref, results, v;
      ref = this.instances;
      results = [];
      for (k in ref) {
        v = ref[k];
        results.push({
          key: k,
          limiter: v
        });
      }
      return results;
    }
    keys() {
      return Object.keys(this.instances);
    }
    clusterKeys() {
      var _this2 = this;
      return _asyncToGenerator(function* () {
        var cursor, end, found, i, k, keys, len, next, start;
        if (_this2.connection == null) {
          return _this2.Promise.resolve(_this2.keys());
        }
        keys = [];
        cursor = null;
        start = `b_${_this2.id}-`.length;
        end = "_settings".length;
        while (cursor !== 0) {
          var _yield$_this2$connect = yield _this2.connection.__runCommand__(["scan", cursor != null ? cursor : 0, "match", `b_${_this2.id}-*_settings`, "count", 10000]);
          var _yield$_this2$connect2 = _slicedToArray(_yield$_this2$connect, 2);
          next = _yield$_this2$connect2[0];
          found = _yield$_this2$connect2[1];
          cursor = ~~next;
          for (i = 0, len = found.length; i < len; i++) {
            k = found[i];
            keys.push(k.slice(start, -end));
          }
        }
        return keys;
      })();
    }
    _startAutoCleanup() {
      var _this3 = this;
      var base;
      clearInterval(this.interval);
      return typeof (base = this.interval = setInterval( /*#__PURE__*/_asyncToGenerator(function* () {
        var e, k, ref, results, time, v;
        time = Date.now();
        ref = _this3.instances;
        results = [];
        for (k in ref) {
          v = ref[k];
          try {
            if (yield v._store.__groupCheck__(time)) {
              results.push(_this3.deleteKey(k));
            } else {
              results.push(void 0);
            }
          } catch (error) {
            e = error;
            results.push(v.Events.trigger("error", e));
          }
        }
        return results;
      }), this.timeout / 2)).unref === "function" ? base.unref() : void 0;
    }
    updateSettings(options = {}) {
      parser.overwrite(options, this.defaults, this);
      parser.overwrite(options, options, this.limiterOptions);
      if (options.timeout != null) {
        return this._startAutoCleanup();
      }
    }
    disconnect(flush = true) {
      var ref;
      if (!this.sharedConnection) {
        return (ref = this.connection) != null ? ref.disconnect(flush) : void 0;
      }
    }
  }
  ;
  Group.prototype.defaults = {
    timeout: 1000 * 60 * 5,
    connection: null,
    Promise: Promise,
    id: "group-key"
  };
  return Group;
}.call(void 0);
module.exports = Group;