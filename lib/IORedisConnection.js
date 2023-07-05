"use strict";

function _slicedToArray(arr, i) { return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _unsupportedIterableToArray(arr, i) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(o, minLen) { if (!o) return; if (typeof o === "string") return _arrayLikeToArray(o, minLen); var n = Object.prototype.toString.call(o).slice(8, -1); if (n === "Object" && o.constructor) n = o.constructor.name; if (n === "Map" || n === "Set") return Array.from(o); if (n === "Arguments" || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)) return _arrayLikeToArray(o, minLen); }
function _arrayLikeToArray(arr, len) { if (len == null || len > arr.length) len = arr.length; for (var i = 0, arr2 = new Array(len); i < len; i++) arr2[i] = arr[i]; return arr2; }
function _iterableToArrayLimit(arr, i) { var _i = null == arr ? null : "undefined" != typeof Symbol && arr[Symbol.iterator] || arr["@@iterator"]; if (null != _i) { var _s, _e, _x, _r, _arr = [], _n = !0, _d = !1; try { if (_x = (_i = _i.call(arr)).next, 0 === i) { if (Object(_i) !== _i) return; _n = !1; } else for (; !(_n = (_s = _x.call(_i)).done) && (_arr.push(_s.value), _arr.length !== i); _n = !0); } catch (err) { _d = !0, _e = err; } finally { try { if (!_n && null != _i.return && (_r = _i.return(), Object(_r) !== _r)) return; } finally { if (_d) throw _e; } } return _arr; } }
function _arrayWithHoles(arr) { if (Array.isArray(arr)) return arr; }
function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }
function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }
var Events, IORedisConnection, Scripts, parser;
parser = require("./parser");
Events = require("./Events");
Scripts = require("./Scripts");
IORedisConnection = function () {
  class IORedisConnection {
    constructor(options = {}) {
      parser.load(options, this.defaults, this);
      if (this.Redis == null) {
        this.Redis = eval("require")("ioredis"); // Obfuscated or else Webpack/Angular will try to inline the optional ioredis module. To override this behavior: pass the ioredis module to Bottleneck as the 'Redis' option.
      }

      if (this.Events == null) {
        this.Events = new Events(this);
      }
      this.terminated = false;
      if (this.clusterNodes != null) {
        this.client = new this.Redis.Cluster(this.clusterNodes, this.clientOptions);
        this.subscriber = new this.Redis.Cluster(this.clusterNodes, this.clientOptions);
      } else if (this.client != null && this.client.duplicate == null) {
        this.subscriber = new this.Redis.Cluster(this.client.startupNodes, this.client.options);
      } else {
        if (this.client == null) {
          this.client = new this.Redis(this.clientOptions);
        }
        this.subscriber = this.client.duplicate();
      }
      this.limiters = {};
      this.ready = this.Promise.all([this._setup(this.client, false), this._setup(this.subscriber, true)]).then(() => {
        this._loadScripts();
        return {
          client: this.client,
          subscriber: this.subscriber
        };
      });
    }
    _setup(client, sub) {
      client.setMaxListeners(0);
      return new this.Promise((resolve, reject) => {
        client.on("error", e => {
          return this.Events.trigger("error", e);
        });
        if (sub) {
          client.on("message", (channel, message) => {
            var ref;
            return (ref = this.limiters[channel]) != null ? ref._store.onMessage(channel, message) : void 0;
          });
        }
        if (client.status === "ready") {
          return resolve();
        } else {
          return client.once("ready", resolve);
        }
      });
    }
    _loadScripts() {
      return Scripts.names.forEach(name => {
        return this.client.defineCommand(name, {
          lua: Scripts.payload(name)
        });
      });
    }
    __runCommand__(cmd) {
      var _this = this;
      return _asyncToGenerator(function* () {
        var _, deleted;
        yield _this.ready;
        var _yield$_this$client$p = yield _this.client.pipeline([cmd]).exec();
        var _yield$_this$client$p2 = _slicedToArray(_yield$_this$client$p, 1);
        var _yield$_this$client$p3 = _slicedToArray(_yield$_this$client$p2[0], 2);
        _ = _yield$_this$client$p3[0];
        deleted = _yield$_this$client$p3[1];
        return deleted;
      })();
    }
    __addLimiter__(instance) {
      return this.Promise.all([instance.channel(), instance.channel_client()].map(channel => {
        return new this.Promise((resolve, reject) => {
          return this.subscriber.subscribe(channel, () => {
            this.limiters[channel] = instance;
            return resolve();
          });
        });
      }));
    }
    __removeLimiter__(instance) {
      var _this2 = this;
      return [instance.channel(), instance.channel_client()].forEach( /*#__PURE__*/function () {
        var _ref = _asyncToGenerator(function* (channel) {
          if (!_this2.terminated) {
            yield _this2.subscriber.unsubscribe(channel);
          }
          return delete _this2.limiters[channel];
        });
        return function (_x2) {
          return _ref.apply(this, arguments);
        };
      }());
    }
    __scriptArgs__(name, id, args, cb) {
      var keys;
      keys = Scripts.keys(name, id);
      return [keys.length].concat(keys, args, cb);
    }
    __scriptFn__(name) {
      return this.client[name].bind(this.client);
    }
    disconnect(flush = true) {
      var i, k, len, ref;
      ref = Object.keys(this.limiters);
      for (i = 0, len = ref.length; i < len; i++) {
        k = ref[i];
        clearInterval(this.limiters[k]._store.heartbeat);
      }
      this.limiters = {};
      this.terminated = true;
      if (flush) {
        return this.Promise.all([this.client.quit(), this.subscriber.quit()]);
      } else {
        this.client.disconnect();
        this.subscriber.disconnect();
        return this.Promise.resolve();
      }
    }
  }
  ;
  IORedisConnection.prototype.datastore = "ioredis";
  IORedisConnection.prototype.defaults = {
    Redis: null,
    clientOptions: {},
    clusterNodes: null,
    client: null,
    Promise: Promise,
    Events: null
  };
  return IORedisConnection;
}.call(void 0);
module.exports = IORedisConnection;