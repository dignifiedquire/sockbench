(function(){var require = function (file, cwd) {
    var resolved = require.resolve(file, cwd || '/');
    var mod = require.modules[resolved];
    if (!mod) throw new Error(
        'Failed to resolve module ' + file + ', tried ' + resolved
    );
    var cached = require.cache[resolved];
    var res = cached? cached.exports : mod();
    return res;
};

require.paths = [];
require.modules = {};
require.cache = {};
require.extensions = [".js",".coffee",".json"];

require._core = {
    'assert': true,
    'events': true,
    'fs': true,
    'path': true,
    'vm': true
};

require.resolve = (function () {
    return function (x, cwd) {
        if (!cwd) cwd = '/';
        
        if (require._core[x]) return x;
        var path = require.modules.path();
        cwd = path.resolve('/', cwd);
        var y = cwd || '/';
        
        if (x.match(/^(?:\.\.?\/|\/)/)) {
            var m = loadAsFileSync(path.resolve(y, x))
                || loadAsDirectorySync(path.resolve(y, x));
            if (m) return m;
        }
        
        var n = loadNodeModulesSync(x, y);
        if (n) return n;
        
        throw new Error("Cannot find module '" + x + "'");
        
        function loadAsFileSync (x) {
            x = path.normalize(x);
            if (require.modules[x]) {
                return x;
            }
            
            for (var i = 0; i < require.extensions.length; i++) {
                var ext = require.extensions[i];
                if (require.modules[x + ext]) return x + ext;
            }
        }
        
        function loadAsDirectorySync (x) {
            x = x.replace(/\/+$/, '');
            var pkgfile = path.normalize(x + '/package.json');
            if (require.modules[pkgfile]) {
                var pkg = require.modules[pkgfile]();
                var b = pkg.browserify;
                if (typeof b === 'object' && b.main) {
                    var m = loadAsFileSync(path.resolve(x, b.main));
                    if (m) return m;
                }
                else if (typeof b === 'string') {
                    var m = loadAsFileSync(path.resolve(x, b));
                    if (m) return m;
                }
                else if (pkg.main) {
                    var m = loadAsFileSync(path.resolve(x, pkg.main));
                    if (m) return m;
                }
            }
            
            return loadAsFileSync(x + '/index');
        }
        
        function loadNodeModulesSync (x, start) {
            var dirs = nodeModulesPathsSync(start);
            for (var i = 0; i < dirs.length; i++) {
                var dir = dirs[i];
                var m = loadAsFileSync(dir + '/' + x);
                if (m) return m;
                var n = loadAsDirectorySync(dir + '/' + x);
                if (n) return n;
            }
            
            var m = loadAsFileSync(x);
            if (m) return m;
        }
        
        function nodeModulesPathsSync (start) {
            var parts;
            if (start === '/') parts = [ '' ];
            else parts = path.normalize(start).split('/');
            
            var dirs = [];
            for (var i = parts.length - 1; i >= 0; i--) {
                if (parts[i] === 'node_modules') continue;
                var dir = parts.slice(0, i + 1).join('/') + '/node_modules';
                dirs.push(dir);
            }
            
            return dirs;
        }
    };
})();

require.alias = function (from, to) {
    var path = require.modules.path();
    var res = null;
    try {
        res = require.resolve(from + '/package.json', '/');
    }
    catch (err) {
        res = require.resolve(from, '/');
    }
    var basedir = path.dirname(res);
    
    var keys = (Object.keys || function (obj) {
        var res = [];
        for (var key in obj) res.push(key);
        return res;
    })(require.modules);
    
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key.slice(0, basedir.length + 1) === basedir + '/') {
            var f = key.slice(basedir.length);
            require.modules[to + f] = require.modules[basedir + f];
        }
        else if (key === basedir) {
            require.modules[to] = require.modules[basedir];
        }
    }
};

(function () {
    var process = {};
    var global = typeof window !== 'undefined' ? window : {};
    var definedProcess = false;
    
    require.define = function (filename, fn) {
        if (!definedProcess && require.modules.__browserify_process) {
            process = require.modules.__browserify_process();
            definedProcess = true;
        }
        
        var dirname = require._core[filename]
            ? ''
            : require.modules.path().dirname(filename)
        ;
        
        var require_ = function (file) {
            var requiredModule = require(file, dirname);
            var cached = require.cache[require.resolve(file, dirname)];

            if (cached && cached.parent === null) {
                cached.parent = module_;
            }

            return requiredModule;
        };
        require_.resolve = function (name) {
            return require.resolve(name, dirname);
        };
        require_.modules = require.modules;
        require_.define = require.define;
        require_.cache = require.cache;
        var module_ = {
            id : filename,
            filename: filename,
            exports : {},
            loaded : false,
            parent: null
        };
        
        require.modules[filename] = function () {
            require.cache[filename] = module_;
            fn.call(
                module_.exports,
                require_,
                module_,
                module_.exports,
                dirname,
                filename,
                process,
                global
            );
            module_.loaded = true;
            return module_.exports;
        };
    };
})();


require.define("path",function(require,module,exports,__dirname,__filename,process,global){function filter (xs, fn) {
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (fn(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length; i >= 0; i--) {
    var last = parts[i];
    if (last == '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Regex to split a filename into [*, dir, basename, ext]
// posix version
var splitPathRe = /^(.+\/(?!$)|\/)?((?:.+?)?(\.[^.]*)?)$/;

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
var resolvedPath = '',
    resolvedAbsolute = false;

for (var i = arguments.length; i >= -1 && !resolvedAbsolute; i--) {
  var path = (i >= 0)
      ? arguments[i]
      : process.cwd();

  // Skip empty and invalid entries
  if (typeof path !== 'string' || !path) {
    continue;
  }

  resolvedPath = path + '/' + resolvedPath;
  resolvedAbsolute = path.charAt(0) === '/';
}

// At this point the path should be resolved to a full absolute path, but
// handle relative paths to be safe (might happen when process.cwd() fails)

// Normalize the path
resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
var isAbsolute = path.charAt(0) === '/',
    trailingSlash = path.slice(-1) === '/';

// Normalize the path
path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }
  
  return (isAbsolute ? '/' : '') + path;
};


// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    return p && typeof p === 'string';
  }).join('/'));
};


exports.dirname = function(path) {
  var dir = splitPathRe.exec(path)[1] || '';
  var isWindows = false;
  if (!dir) {
    // No dirname
    return '.';
  } else if (dir.length === 1 ||
      (isWindows && dir.length <= 3 && dir.charAt(1) === ':')) {
    // It is just a slash or a drive letter with a slash
    return dir;
  } else {
    // It is a full dirname, strip trailing slash
    return dir.substring(0, dir.length - 1);
  }
};


exports.basename = function(path, ext) {
  var f = splitPathRe.exec(path)[2] || '';
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPathRe.exec(path)[3] || '';
};

});

require.define("__browserify_process",function(require,module,exports,__dirname,__filename,process,global){var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
        && window.setImmediate;
    var canPost = typeof window !== 'undefined'
        && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            if (ev.source === window && ev.data === 'browserify-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('browserify-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

process.binding = function (name) {
    if (name === 'evals') return (require)('vm')
    else throw new Error('No such module. (Possibly not yet loaded)')
};

(function () {
    var cwd = '/';
    var path;
    process.cwd = function () { return cwd };
    process.chdir = function (dir) {
        if (!path) path = require('path');
        cwd = path.resolve(dir, cwd);
    };
})();

});

require.define("/node_modules/shoe/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"index.js","browserify":"browser.js"}
});

require.define("/node_modules/shoe/browser.js",function(require,module,exports,__dirname,__filename,process,global){var Stream = require('stream');
var sockjs = require('sockjs-client');

module.exports = function (uri, cb) {
    if (/^\/\/[^\/]+\//.test(uri)) {
        uri = window.location.protocol + uri;
    }
    else if (!/^https?:\/\//.test(uri)) {
        uri = window.location.protocol + '//'
            + window.location.host
            + (/^\//.test(uri) ? uri : '/' + uri)
        ;
    }
    
    var stream = new Stream;
    stream.readable = true;
    stream.writable = true;
    
    var ready = false;
    var buffer = [];
    
    var sock = sockjs(uri);
    stream.sock = sock;
    
    stream.write = function (msg) {
        if (!ready || buffer.length) buffer.push(msg)
        else sock.send(msg)
    };
    stream.end = function (msg) {
        if (msg !== undefined) stream.write(msg);
        if (!ready) {
            stream._ended = true;
            return;
        }
        stream.writable = false;
        sock.close();
    };

    stream.destroy = function () {
        stream._ended = true;
        stream.writable = stream.readable = false;
        buffer.length = 0
        sock.close();
    }
    
    sock.onopen = function () {
        if (typeof cb === 'function') cb();
        ready = true;
        buffer.forEach(function (msg) {
            sock.send(msg);
        });
        buffer = [];
        stream.emit('connect')
        if (stream._ended) stream.end();
    };
    sock.onmessage = function (e) {
        stream.emit('data', e.data);
    };
    sock.onclose = function () {
        stream.emit('end');
        stream.writable = false;
        stream.readable = false;
    };
    
    return stream;
};

});

require.define("stream",function(require,module,exports,__dirname,__filename,process,global){var events = require('events');
var util = require('util');

function Stream() {
  events.EventEmitter.call(this);
}
util.inherits(Stream, events.EventEmitter);
module.exports = Stream;
// Backwards-compat with node 0.4.x
Stream.Stream = Stream;

Stream.prototype.pipe = function(dest, options) {
  var source = this;

  function ondata(chunk) {
    if (dest.writable) {
      if (false === dest.write(chunk) && source.pause) {
        source.pause();
      }
    }
  }

  source.on('data', ondata);

  function ondrain() {
    if (source.readable && source.resume) {
      source.resume();
    }
  }

  dest.on('drain', ondrain);

  // If the 'end' option is not supplied, dest.end() will be called when
  // source gets the 'end' or 'close' events.  Only dest.end() once, and
  // only when all sources have ended.
  if (!dest._isStdio && (!options || options.end !== false)) {
    dest._pipeCount = dest._pipeCount || 0;
    dest._pipeCount++;

    source.on('end', onend);
    source.on('close', onclose);
  }

  var didOnEnd = false;
  function onend() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest._pipeCount--;

    // remove the listeners
    cleanup();

    if (dest._pipeCount > 0) {
      // waiting for other incoming streams to end.
      return;
    }

    dest.end();
  }


  function onclose() {
    if (didOnEnd) return;
    didOnEnd = true;

    dest._pipeCount--;

    // remove the listeners
    cleanup();

    if (dest._pipeCount > 0) {
      // waiting for other incoming streams to end.
      return;
    }

    dest.destroy();
  }

  // don't leave dangling pipes when there are errors.
  function onerror(er) {
    cleanup();
    if (this.listeners('error').length === 0) {
      throw er; // Unhandled stream error in pipe.
    }
  }

  source.on('error', onerror);
  dest.on('error', onerror);

  // remove all the event listeners that were added.
  function cleanup() {
    source.removeListener('data', ondata);
    dest.removeListener('drain', ondrain);

    source.removeListener('end', onend);
    source.removeListener('close', onclose);

    source.removeListener('error', onerror);
    dest.removeListener('error', onerror);

    source.removeListener('end', cleanup);
    source.removeListener('close', cleanup);

    dest.removeListener('end', cleanup);
    dest.removeListener('close', cleanup);
  }

  source.on('end', cleanup);
  source.on('close', cleanup);

  dest.on('end', cleanup);
  dest.on('close', cleanup);

  dest.emit('pipe', source);

  // Allow for unix-like usage: A.pipe(B).pipe(C)
  return dest;
};

});

require.define("events",function(require,module,exports,__dirname,__filename,process,global){if (!process.EventEmitter) process.EventEmitter = function () {};

var EventEmitter = exports.EventEmitter = process.EventEmitter;
var isArray = typeof Array.isArray === 'function'
    ? Array.isArray
    : function (xs) {
        return Object.prototype.toString.call(xs) === '[object Array]'
    }
;
function indexOf (xs, x) {
    if (xs.indexOf) return xs.indexOf(x);
    for (var i = 0; i < xs.length; i++) {
        if (x === xs[i]) return i;
    }
    return -1;
}

// By default EventEmitters will print a warning if more than
// 10 listeners are added to it. This is a useful default which
// helps finding memory leaks.
//
// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
var defaultMaxListeners = 10;
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!this._events) this._events = {};
  this._events.maxListeners = n;
};


EventEmitter.prototype.emit = function(type) {
  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events || !this._events.error ||
        (isArray(this._events.error) && !this._events.error.length))
    {
      if (arguments[1] instanceof Error) {
        throw arguments[1]; // Unhandled 'error' event
      } else {
        throw new Error("Uncaught, unspecified 'error' event.");
      }
      return false;
    }
  }

  if (!this._events) return false;
  var handler = this._events[type];
  if (!handler) return false;

  if (typeof handler == 'function') {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        var args = Array.prototype.slice.call(arguments, 1);
        handler.apply(this, args);
    }
    return true;

  } else if (isArray(handler)) {
    var args = Array.prototype.slice.call(arguments, 1);

    var listeners = handler.slice();
    for (var i = 0, l = listeners.length; i < l; i++) {
      listeners[i].apply(this, args);
    }
    return true;

  } else {
    return false;
  }
};

// EventEmitter is defined in src/node_events.cc
// EventEmitter.prototype.emit() is also defined there.
EventEmitter.prototype.addListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('addListener only takes instances of Function');
  }

  if (!this._events) this._events = {};

  // To avoid recursion in the case that type == "newListeners"! Before
  // adding it to the listeners, first emit "newListeners".
  this.emit('newListener', type, listener);

  if (!this._events[type]) {
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  } else if (isArray(this._events[type])) {

    // Check for listener leak
    if (!this._events[type].warned) {
      var m;
      if (this._events.maxListeners !== undefined) {
        m = this._events.maxListeners;
      } else {
        m = defaultMaxListeners;
      }

      if (m && m > 0 && this._events[type].length > m) {
        this._events[type].warned = true;
        console.error('(node) warning: possible EventEmitter memory ' +
                      'leak detected. %d listeners added. ' +
                      'Use emitter.setMaxListeners() to increase limit.',
                      this._events[type].length);
        console.trace();
      }
    }

    // If we've already got an array, just append.
    this._events[type].push(listener);
  } else {
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  var self = this;
  self.on(type, function g() {
    self.removeListener(type, g);
    listener.apply(this, arguments);
  });

  return this;
};

EventEmitter.prototype.removeListener = function(type, listener) {
  if ('function' !== typeof listener) {
    throw new Error('removeListener only takes instances of Function');
  }

  // does not use listeners(), so no side effect of creating _events[type]
  if (!this._events || !this._events[type]) return this;

  var list = this._events[type];

  if (isArray(list)) {
    var i = indexOf(list, listener);
    if (i < 0) return this;
    list.splice(i, 1);
    if (list.length == 0)
      delete this._events[type];
  } else if (this._events[type] === listener) {
    delete this._events[type];
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  // does not use listeners(), so no side effect of creating _events[type]
  if (type && this._events && this._events[type]) this._events[type] = null;
  return this;
};

EventEmitter.prototype.listeners = function(type) {
  if (!this._events) this._events = {};
  if (!this._events[type]) this._events[type] = [];
  if (!isArray(this._events[type])) {
    this._events[type] = [this._events[type]];
  }
  return this._events[type];
};

});

require.define("util",function(require,module,exports,__dirname,__filename,process,global){var events = require('events');

exports.isArray = isArray;
exports.isDate = function(obj){return Object.prototype.toString.call(obj) === '[object Date]'};
exports.isRegExp = function(obj){return Object.prototype.toString.call(obj) === '[object RegExp]'};


exports.print = function () {};
exports.puts = function () {};
exports.debug = function() {};

exports.inspect = function(obj, showHidden, depth, colors) {
  var seen = [];

  var stylize = function(str, styleType) {
    // http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
    var styles =
        { 'bold' : [1, 22],
          'italic' : [3, 23],
          'underline' : [4, 24],
          'inverse' : [7, 27],
          'white' : [37, 39],
          'grey' : [90, 39],
          'black' : [30, 39],
          'blue' : [34, 39],
          'cyan' : [36, 39],
          'green' : [32, 39],
          'magenta' : [35, 39],
          'red' : [31, 39],
          'yellow' : [33, 39] };

    var style =
        { 'special': 'cyan',
          'number': 'blue',
          'boolean': 'yellow',
          'undefined': 'grey',
          'null': 'bold',
          'string': 'green',
          'date': 'magenta',
          // "name": intentionally not styling
          'regexp': 'red' }[styleType];

    if (style) {
      return '\033[' + styles[style][0] + 'm' + str +
             '\033[' + styles[style][1] + 'm';
    } else {
      return str;
    }
  };
  if (! colors) {
    stylize = function(str, styleType) { return str; };
  }

  function format(value, recurseTimes) {
    // Provide a hook for user-specified inspect functions.
    // Check that value is an object with an inspect function on it
    if (value && typeof value.inspect === 'function' &&
        // Filter out the util module, it's inspect function is special
        value !== exports &&
        // Also filter out any prototype objects using the circular check.
        !(value.constructor && value.constructor.prototype === value)) {
      return value.inspect(recurseTimes);
    }

    // Primitive types cannot have properties
    switch (typeof value) {
      case 'undefined':
        return stylize('undefined', 'undefined');

      case 'string':
        var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                                 .replace(/'/g, "\\'")
                                                 .replace(/\\"/g, '"') + '\'';
        return stylize(simple, 'string');

      case 'number':
        return stylize('' + value, 'number');

      case 'boolean':
        return stylize('' + value, 'boolean');
    }
    // For some reason typeof null is "object", so special case here.
    if (value === null) {
      return stylize('null', 'null');
    }

    // Look up the keys of the object.
    var visible_keys = Object_keys(value);
    var keys = showHidden ? Object_getOwnPropertyNames(value) : visible_keys;

    // Functions without properties can be shortcutted.
    if (typeof value === 'function' && keys.length === 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        var name = value.name ? ': ' + value.name : '';
        return stylize('[Function' + name + ']', 'special');
      }
    }

    // Dates without properties can be shortcutted
    if (isDate(value) && keys.length === 0) {
      return stylize(value.toUTCString(), 'date');
    }

    var base, type, braces;
    // Determine the object type
    if (isArray(value)) {
      type = 'Array';
      braces = ['[', ']'];
    } else {
      type = 'Object';
      braces = ['{', '}'];
    }

    // Make functions say that they are functions
    if (typeof value === 'function') {
      var n = value.name ? ': ' + value.name : '';
      base = (isRegExp(value)) ? ' ' + value : ' [Function' + n + ']';
    } else {
      base = '';
    }

    // Make dates with properties first say the date
    if (isDate(value)) {
      base = ' ' + value.toUTCString();
    }

    if (keys.length === 0) {
      return braces[0] + base + braces[1];
    }

    if (recurseTimes < 0) {
      if (isRegExp(value)) {
        return stylize('' + value, 'regexp');
      } else {
        return stylize('[Object]', 'special');
      }
    }

    seen.push(value);

    var output = keys.map(function(key) {
      var name, str;
      if (value.__lookupGetter__) {
        if (value.__lookupGetter__(key)) {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Getter/Setter]', 'special');
          } else {
            str = stylize('[Getter]', 'special');
          }
        } else {
          if (value.__lookupSetter__(key)) {
            str = stylize('[Setter]', 'special');
          }
        }
      }
      if (visible_keys.indexOf(key) < 0) {
        name = '[' + key + ']';
      }
      if (!str) {
        if (seen.indexOf(value[key]) < 0) {
          if (recurseTimes === null) {
            str = format(value[key]);
          } else {
            str = format(value[key], recurseTimes - 1);
          }
          if (str.indexOf('\n') > -1) {
            if (isArray(value)) {
              str = str.split('\n').map(function(line) {
                return '  ' + line;
              }).join('\n').substr(2);
            } else {
              str = '\n' + str.split('\n').map(function(line) {
                return '   ' + line;
              }).join('\n');
            }
          }
        } else {
          str = stylize('[Circular]', 'special');
        }
      }
      if (typeof name === 'undefined') {
        if (type === 'Array' && key.match(/^\d+$/)) {
          return str;
        }
        name = JSON.stringify('' + key);
        if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
          name = name.substr(1, name.length - 2);
          name = stylize(name, 'name');
        } else {
          name = name.replace(/'/g, "\\'")
                     .replace(/\\"/g, '"')
                     .replace(/(^"|"$)/g, "'");
          name = stylize(name, 'string');
        }
      }

      return name + ': ' + str;
    });

    seen.pop();

    var numLinesEst = 0;
    var length = output.reduce(function(prev, cur) {
      numLinesEst++;
      if (cur.indexOf('\n') >= 0) numLinesEst++;
      return prev + cur.length + 1;
    }, 0);

    if (length > 50) {
      output = braces[0] +
               (base === '' ? '' : base + '\n ') +
               ' ' +
               output.join(',\n  ') +
               ' ' +
               braces[1];

    } else {
      output = braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
    }

    return output;
  }
  return format(obj, (typeof depth === 'undefined' ? 2 : depth));
};


function isArray(ar) {
  return ar instanceof Array ||
         Array.isArray(ar) ||
         (ar && ar !== Object.prototype && isArray(ar.__proto__));
}


function isRegExp(re) {
  return re instanceof RegExp ||
    (typeof re === 'object' && Object.prototype.toString.call(re) === '[object RegExp]');
}


function isDate(d) {
  if (d instanceof Date) return true;
  if (typeof d !== 'object') return false;
  var properties = Date.prototype && Object_getOwnPropertyNames(Date.prototype);
  var proto = d.__proto__ && Object_getOwnPropertyNames(d.__proto__);
  return JSON.stringify(proto) === JSON.stringify(properties);
}

function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}

exports.log = function (msg) {};

exports.pump = null;

var Object_keys = Object.keys || function (obj) {
    var res = [];
    for (var key in obj) res.push(key);
    return res;
};

var Object_getOwnPropertyNames = Object.getOwnPropertyNames || function (obj) {
    var res = [];
    for (var key in obj) {
        if (Object.hasOwnProperty.call(obj, key)) res.push(key);
    }
    return res;
};

var Object_create = Object.create || function (prototype, properties) {
    // from es5-shim
    var object;
    if (prototype === null) {
        object = { '__proto__' : null };
    }
    else {
        if (typeof prototype !== 'object') {
            throw new TypeError(
                'typeof prototype[' + (typeof prototype) + '] != \'object\''
            );
        }
        var Type = function () {};
        Type.prototype = prototype;
        object = new Type();
        object.__proto__ = prototype;
    }
    if (typeof properties !== 'undefined' && Object.defineProperties) {
        Object.defineProperties(object, properties);
    }
    return object;
};

exports.inherits = function(ctor, superCtor) {
  ctor.super_ = superCtor;
  ctor.prototype = Object_create(superCtor.prototype, {
    constructor: {
      value: ctor,
      enumerable: false,
      writable: true,
      configurable: true
    }
  });
};

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (typeof f !== 'string') {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(exports.inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j': return JSON.stringify(args[i++]);
      default:
        return x;
    }
  });
  for(var x = args[i]; i < len; x = args[++i]){
    if (x === null || typeof x !== 'object') {
      str += ' ' + x;
    } else {
      str += ' ' + exports.inspect(x);
    }
  }
  return str;
};

});

require.define("/node_modules/shoe/node_modules/sockjs-client/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"sockjs.js"}
});

require.define("/node_modules/shoe/node_modules/sockjs-client/sockjs.js",function(require,module,exports,__dirname,__filename,process,global){/* SockJS client, version 0.3.1.7.ga67f.dirty, http://sockjs.org, MIT License

Copyright (c) 2011-2012 VMware, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
*/

// JSON2 by Douglas Crockford (minified).
var JSON;JSON||(JSON={}),function(){function str(a,b){var c,d,e,f,g=gap,h,i=b[a];i&&typeof i=="object"&&typeof i.toJSON=="function"&&(i=i.toJSON(a)),typeof rep=="function"&&(i=rep.call(b,a,i));switch(typeof i){case"string":return quote(i);case"number":return isFinite(i)?String(i):"null";case"boolean":case"null":return String(i);case"object":if(!i)return"null";gap+=indent,h=[];if(Object.prototype.toString.apply(i)==="[object Array]"){f=i.length;for(c=0;c<f;c+=1)h[c]=str(c,i)||"null";e=h.length===0?"[]":gap?"[\n"+gap+h.join(",\n"+gap)+"\n"+g+"]":"["+h.join(",")+"]",gap=g;return e}if(rep&&typeof rep=="object"){f=rep.length;for(c=0;c<f;c+=1)typeof rep[c]=="string"&&(d=rep[c],e=str(d,i),e&&h.push(quote(d)+(gap?": ":":")+e))}else for(d in i)Object.prototype.hasOwnProperty.call(i,d)&&(e=str(d,i),e&&h.push(quote(d)+(gap?": ":":")+e));e=h.length===0?"{}":gap?"{\n"+gap+h.join(",\n"+gap)+"\n"+g+"}":"{"+h.join(",")+"}",gap=g;return e}}function quote(a){escapable.lastIndex=0;return escapable.test(a)?'"'+a.replace(escapable,function(a){var b=meta[a];return typeof b=="string"?b:"\\u"+("0000"+a.charCodeAt(0).toString(16)).slice(-4)})+'"':'"'+a+'"'}function f(a){return a<10?"0"+a:a}"use strict",typeof Date.prototype.toJSON!="function"&&(Date.prototype.toJSON=function(a){return isFinite(this.valueOf())?this.getUTCFullYear()+"-"+f(this.getUTCMonth()+1)+"-"+f(this.getUTCDate())+"T"+f(this.getUTCHours())+":"+f(this.getUTCMinutes())+":"+f(this.getUTCSeconds())+"Z":null},String.prototype.toJSON=Number.prototype.toJSON=Boolean.prototype.toJSON=function(a){return this.valueOf()});var cx=/[\u0000\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,escapable=/[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,gap,indent,meta={"\b":"\\b","\t":"\\t","\n":"\\n","\f":"\\f","\r":"\\r",'"':'\\"',"\\":"\\\\"},rep;typeof JSON.stringify!="function"&&(JSON.stringify=function(a,b,c){var d;gap="",indent="";if(typeof c=="number")for(d=0;d<c;d+=1)indent+=" ";else typeof c=="string"&&(indent=c);rep=b;if(!b||typeof b=="function"||typeof b=="object"&&typeof b.length=="number")return str("",{"":a});throw new Error("JSON.stringify")}),typeof JSON.parse!="function"&&(JSON.parse=function(text,reviver){function walk(a,b){var c,d,e=a[b];if(e&&typeof e=="object")for(c in e)Object.prototype.hasOwnProperty.call(e,c)&&(d=walk(e,c),d!==undefined?e[c]=d:delete e[c]);return reviver.call(a,b,e)}var j;text=String(text),cx.lastIndex=0,cx.test(text)&&(text=text.replace(cx,function(a){return"\\u"+("0000"+a.charCodeAt(0).toString(16)).slice(-4)}));if(/^[\],:{}\s]*$/.test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g,"@").replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g,"]").replace(/(?:^|:|,)(?:\s*\[)+/g,""))){j=eval("("+text+")");return typeof reviver=="function"?walk({"":j},""):j}throw new SyntaxError("JSON.parse")})}()


//     [*] Including lib/index.js
// Public object
var SockJS = (function(){
              var _document = document;
              var _window = window;
              var utils = {};


//         [*] Including lib/reventtarget.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

/* Simplified implementation of DOM2 EventTarget.
 *   http://www.w3.org/TR/DOM-Level-2-Events/events.html#Events-EventTarget
 */
var REventTarget = function() {};
REventTarget.prototype.addEventListener = function (eventType, listener) {
    if(!this._listeners) {
         this._listeners = {};
    }
    if(!(eventType in this._listeners)) {
        this._listeners[eventType] = [];
    }
    var arr = this._listeners[eventType];
    if(utils.arrIndexOf(arr, listener) === -1) {
        arr.push(listener);
    }
    return;
};

REventTarget.prototype.removeEventListener = function (eventType, listener) {
    if(!(this._listeners && (eventType in this._listeners))) {
        return;
    }
    var arr = this._listeners[eventType];
    var idx = utils.arrIndexOf(arr, listener);
    if (idx !== -1) {
        if(arr.length > 1) {
            this._listeners[eventType] = arr.slice(0, idx).concat( arr.slice(idx+1) );
        } else {
            delete this._listeners[eventType];
        }
        return;
    }
    return;
};

REventTarget.prototype.dispatchEvent = function (event) {
    var t = event.type;
    var args = Array.prototype.slice.call(arguments, 0);
    if (this['on'+t]) {
        this['on'+t].apply(this, args);
    }
    if (this._listeners && t in this._listeners) {
        for(var i=0; i < this._listeners[t].length; i++) {
            this._listeners[t][i].apply(this, args);
        }
    }
};
//         [*] End of lib/reventtarget.js


//         [*] Including lib/simpleevent.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var SimpleEvent = function(type, obj) {
    this.type = type;
    if (typeof obj !== 'undefined') {
        for(var k in obj) {
            if (!obj.hasOwnProperty(k)) continue;
            this[k] = obj[k];
        }
    }
};

SimpleEvent.prototype.toString = function() {
    var r = [];
    for(var k in this) {
        if (!this.hasOwnProperty(k)) continue;
        var v = this[k];
        if (typeof v === 'function') v = '[function]';
        r.push(k + '=' + v);
    }
    return 'SimpleEvent(' + r.join(', ') + ')';
};
//         [*] End of lib/simpleevent.js


//         [*] Including lib/eventemitter.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var EventEmitter = function(events) {
    this.events = events || [];
};
EventEmitter.prototype.emit = function(type) {
    var that = this;
    var args = Array.prototype.slice.call(arguments, 1);
    if (!that.nuked && that['on'+type]) {
        that['on'+type].apply(that, args);
    }
    if (utils.arrIndexOf(that.events, type) === -1) {
        utils.log('Event ' + JSON.stringify(type) +
                  ' not listed ' + JSON.stringify(that.events) +
                  ' in ' + that);
    }
};

EventEmitter.prototype.nuke = function(type) {
    var that = this;
    that.nuked = true;
    for(var i=0; i<that.events.length; i++) {
        delete that[that.events[i]];
    }
};
//         [*] End of lib/eventemitter.js


//         [*] Including lib/utils.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var random_string_chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
utils.random_string = function(length, max) {
    max = max || random_string_chars.length;
    var i, ret = [];
    for(i=0; i < length; i++) {
        ret.push( random_string_chars.substr(Math.floor(Math.random() * max),1) );
    }
    return ret.join('');
};
utils.random_number = function(max) {
    return Math.floor(Math.random() * max);
};
utils.random_number_string = function(max) {
    var t = (''+(max - 1)).length;
    var p = Array(t+1).join('0');
    return (p + utils.random_number(max)).slice(-t);
};

// Assuming that url looks like: http://asdasd:111/asd
utils.getOrigin = function(url) {
    url += '/';
    var parts = url.split('/').slice(0, 3);
    return parts.join('/');
};

utils.isSameOriginUrl = function(url_a, url_b) {
    // location.origin would do, but it's not always available.
    if (!url_b) url_b = _window.location.href;

    return (url_a.split('/').slice(0,3).join('/')
                ===
            url_b.split('/').slice(0,3).join('/'));
};

utils.getParentDomain = function(url) {
    // ipv4 ip address
    if (/^[0-9.]*$/.test(url)) return url;
    // ipv6 ip address
    if (/^\[/.test(url)) return url;
    // no dots
    if (!(/[.]/.test(url))) return url;

    var parts = url.split('.').slice(1);
    return parts.join('.');
};

utils.objectExtend = function(dst, src) {
    for(var k in src) {
        if (src.hasOwnProperty(k)) {
            dst[k] = src[k];
        }
    }
    return dst;
};

var WPrefix = '_jp';

utils.polluteGlobalNamespace = function() {
    if (!(WPrefix in _window)) {
        _window[WPrefix] = {};
    }
};

utils.closeFrame = function (code, reason) {
    return 'c'+JSON.stringify([code, reason]);
};

utils.userSetCode = function (code) {
    return code === 1000 || (code >= 3000 && code <= 4999);
};

// See: http://www.erg.abdn.ac.uk/~gerrit/dccp/notes/ccid2/rto_estimator/
// and RFC 2988.
utils.countRTO = function (rtt) {
    var rto;
    if (rtt > 100) {
        rto = 3 * rtt; // rto > 300msec
    } else {
        rto = rtt + 200; // 200msec < rto <= 300msec
    }
    return rto;
}

utils.log = function() {
    if (_window.console && console.log && console.log.apply) {
        console.log.apply(console, arguments);
    }
};

utils.bind = function(fun, that) {
    if (fun.bind) {
        return fun.bind(that);
    } else {
        return function() {
            return fun.apply(that, arguments);
        };
    }
};

utils.flatUrl = function(url) {
    return url.indexOf('?') === -1 && url.indexOf('#') === -1;
};

utils.amendUrl = function(url) {
    var dl = _document.location;
    if (!url) {
        throw new Error('Wrong url for SockJS');
    }
    if (!utils.flatUrl(url)) {
        throw new Error('Only basic urls are supported in SockJS');
    }

    //  '//abc' --> 'http://abc'
    if (url.indexOf('//') === 0) {
        url = dl.protocol + url;
    }
    // '/abc' --> 'http://localhost:80/abc'
    if (url.indexOf('/') === 0) {
        url = dl.protocol + '//' + dl.host + url;
    }
    // strip trailing slashes
    url = url.replace(/[/]+$/,'');
    return url;
};

// IE doesn't support [].indexOf.
utils.arrIndexOf = function(arr, obj){
    for(var i=0; i < arr.length; i++){
        if(arr[i] === obj){
            return i;
        }
    }
    return -1;
};

utils.arrSkip = function(arr, obj) {
    var idx = utils.arrIndexOf(arr, obj);
    if (idx === -1) {
        return arr.slice();
    } else {
        var dst = arr.slice(0, idx);
        return dst.concat(arr.slice(idx+1));
    }
};

// Via: https://gist.github.com/1133122/2121c601c5549155483f50be3da5305e83b8c5df
utils.isArray = Array.isArray || function(value) {
    return {}.toString.call(value).indexOf('Array') >= 0
};

utils.delay = function(t, fun) {
    if(typeof t === 'function') {
        fun = t;
        t = 0;
    }
    return setTimeout(fun, t);
};


// Chars worth escaping, as defined by Douglas Crockford:
//   https://github.com/douglascrockford/JSON-js/blob/47a9882cddeb1e8529e07af9736218075372b8ac/json2.js#L196
var json_escapable = /[\\\"\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
    json_lookup = {
"\u0000":"\\u0000","\u0001":"\\u0001","\u0002":"\\u0002","\u0003":"\\u0003",
"\u0004":"\\u0004","\u0005":"\\u0005","\u0006":"\\u0006","\u0007":"\\u0007",
"\b":"\\b","\t":"\\t","\n":"\\n","\u000b":"\\u000b","\f":"\\f","\r":"\\r",
"\u000e":"\\u000e","\u000f":"\\u000f","\u0010":"\\u0010","\u0011":"\\u0011",
"\u0012":"\\u0012","\u0013":"\\u0013","\u0014":"\\u0014","\u0015":"\\u0015",
"\u0016":"\\u0016","\u0017":"\\u0017","\u0018":"\\u0018","\u0019":"\\u0019",
"\u001a":"\\u001a","\u001b":"\\u001b","\u001c":"\\u001c","\u001d":"\\u001d",
"\u001e":"\\u001e","\u001f":"\\u001f","\"":"\\\"","\\":"\\\\",
"\u007f":"\\u007f","\u0080":"\\u0080","\u0081":"\\u0081","\u0082":"\\u0082",
"\u0083":"\\u0083","\u0084":"\\u0084","\u0085":"\\u0085","\u0086":"\\u0086",
"\u0087":"\\u0087","\u0088":"\\u0088","\u0089":"\\u0089","\u008a":"\\u008a",
"\u008b":"\\u008b","\u008c":"\\u008c","\u008d":"\\u008d","\u008e":"\\u008e",
"\u008f":"\\u008f","\u0090":"\\u0090","\u0091":"\\u0091","\u0092":"\\u0092",
"\u0093":"\\u0093","\u0094":"\\u0094","\u0095":"\\u0095","\u0096":"\\u0096",
"\u0097":"\\u0097","\u0098":"\\u0098","\u0099":"\\u0099","\u009a":"\\u009a",
"\u009b":"\\u009b","\u009c":"\\u009c","\u009d":"\\u009d","\u009e":"\\u009e",
"\u009f":"\\u009f","\u00ad":"\\u00ad","\u0600":"\\u0600","\u0601":"\\u0601",
"\u0602":"\\u0602","\u0603":"\\u0603","\u0604":"\\u0604","\u070f":"\\u070f",
"\u17b4":"\\u17b4","\u17b5":"\\u17b5","\u200c":"\\u200c","\u200d":"\\u200d",
"\u200e":"\\u200e","\u200f":"\\u200f","\u2028":"\\u2028","\u2029":"\\u2029",
"\u202a":"\\u202a","\u202b":"\\u202b","\u202c":"\\u202c","\u202d":"\\u202d",
"\u202e":"\\u202e","\u202f":"\\u202f","\u2060":"\\u2060","\u2061":"\\u2061",
"\u2062":"\\u2062","\u2063":"\\u2063","\u2064":"\\u2064","\u2065":"\\u2065",
"\u2066":"\\u2066","\u2067":"\\u2067","\u2068":"\\u2068","\u2069":"\\u2069",
"\u206a":"\\u206a","\u206b":"\\u206b","\u206c":"\\u206c","\u206d":"\\u206d",
"\u206e":"\\u206e","\u206f":"\\u206f","\ufeff":"\\ufeff","\ufff0":"\\ufff0",
"\ufff1":"\\ufff1","\ufff2":"\\ufff2","\ufff3":"\\ufff3","\ufff4":"\\ufff4",
"\ufff5":"\\ufff5","\ufff6":"\\ufff6","\ufff7":"\\ufff7","\ufff8":"\\ufff8",
"\ufff9":"\\ufff9","\ufffa":"\\ufffa","\ufffb":"\\ufffb","\ufffc":"\\ufffc",
"\ufffd":"\\ufffd","\ufffe":"\\ufffe","\uffff":"\\uffff"};

// Some extra characters that Chrome gets wrong, and substitutes with
// something else on the wire.
var extra_escapable = /[\x00-\x1f\ud800-\udfff\ufffe\uffff\u0300-\u0333\u033d-\u0346\u034a-\u034c\u0350-\u0352\u0357-\u0358\u035c-\u0362\u0374\u037e\u0387\u0591-\u05af\u05c4\u0610-\u0617\u0653-\u0654\u0657-\u065b\u065d-\u065e\u06df-\u06e2\u06eb-\u06ec\u0730\u0732-\u0733\u0735-\u0736\u073a\u073d\u073f-\u0741\u0743\u0745\u0747\u07eb-\u07f1\u0951\u0958-\u095f\u09dc-\u09dd\u09df\u0a33\u0a36\u0a59-\u0a5b\u0a5e\u0b5c-\u0b5d\u0e38-\u0e39\u0f43\u0f4d\u0f52\u0f57\u0f5c\u0f69\u0f72-\u0f76\u0f78\u0f80-\u0f83\u0f93\u0f9d\u0fa2\u0fa7\u0fac\u0fb9\u1939-\u193a\u1a17\u1b6b\u1cda-\u1cdb\u1dc0-\u1dcf\u1dfc\u1dfe\u1f71\u1f73\u1f75\u1f77\u1f79\u1f7b\u1f7d\u1fbb\u1fbe\u1fc9\u1fcb\u1fd3\u1fdb\u1fe3\u1feb\u1fee-\u1fef\u1ff9\u1ffb\u1ffd\u2000-\u2001\u20d0-\u20d1\u20d4-\u20d7\u20e7-\u20e9\u2126\u212a-\u212b\u2329-\u232a\u2adc\u302b-\u302c\uaab2-\uaab3\uf900-\ufa0d\ufa10\ufa12\ufa15-\ufa1e\ufa20\ufa22\ufa25-\ufa26\ufa2a-\ufa2d\ufa30-\ufa6d\ufa70-\ufad9\ufb1d\ufb1f\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40-\ufb41\ufb43-\ufb44\ufb46-\ufb4e\ufff0-\uffff]/g,
    extra_lookup;

// JSON Quote string. Use native implementation when possible.
var JSONQuote = (JSON && JSON.stringify) || function(string) {
    json_escapable.lastIndex = 0;
    if (json_escapable.test(string)) {
        string = string.replace(json_escapable, function(a) {
            return json_lookup[a];
        });
    }
    return '"' + string + '"';
};

// This may be quite slow, so let's delay until user actually uses bad
// characters.
var unroll_lookup = function(escapable) {
    var i;
    var unrolled = {}
    var c = []
    for(i=0; i<65536; i++) {
        c.push( String.fromCharCode(i) );
    }
    escapable.lastIndex = 0;
    c.join('').replace(escapable, function (a) {
        unrolled[ a ] = '\\u' + ('0000' + a.charCodeAt(0).toString(16)).slice(-4);
        return '';
    });
    escapable.lastIndex = 0;
    return unrolled;
};

// Quote string, also taking care of unicode characters that browsers
// often break. Especially, take care of unicode surrogates:
//    http://en.wikipedia.org/wiki/Mapping_of_Unicode_characters#Surrogates
utils.quote = function(string) {
    var quoted = JSONQuote(string);

    // In most cases this should be very fast and good enough.
    extra_escapable.lastIndex = 0;
    if(!extra_escapable.test(quoted)) {
        return quoted;
    }

    if(!extra_lookup) extra_lookup = unroll_lookup(extra_escapable);

    return quoted.replace(extra_escapable, function(a) {
        return extra_lookup[a];
    });
}

var _all_protocols = ['websocket',
                      'xdr-streaming',
                      'xhr-streaming',
                      'iframe-eventsource',
                      'iframe-htmlfile',
                      'xdr-polling',
                      'xhr-polling',
                      'iframe-xhr-polling',
                      'jsonp-polling'];

utils.probeProtocols = function() {
    var probed = {};
    for(var i=0; i<_all_protocols.length; i++) {
        var protocol = _all_protocols[i];
        // User can have a typo in protocol name.
        probed[protocol] = SockJS[protocol] &&
                           SockJS[protocol].enabled();
    }
    return probed;
};

utils.detectProtocols = function(probed, protocols_whitelist, info) {
    var pe = {},
        protocols = [];
    if (!protocols_whitelist) protocols_whitelist = _all_protocols;
    for(var i=0; i<protocols_whitelist.length; i++) {
        var protocol = protocols_whitelist[i];
        pe[protocol] = probed[protocol];
    }
    var maybe_push = function(protos) {
        var proto = protos.shift();
        if (pe[proto]) {
            protocols.push(proto);
        } else {
            if (protos.length > 0) {
                maybe_push(protos);
            }
        }
    }

    // 1. Websocket
    if (info.websocket !== false) {
        maybe_push(['websocket']);
    }

    // 2. Streaming
    if (pe['xhr-streaming'] && !info.null_origin) {
        protocols.push('xhr-streaming');
    } else {
        if (pe['xdr-streaming'] && !info.cookie_needed && !info.null_origin) {
            protocols.push('xdr-streaming');
        } else {
            maybe_push(['iframe-eventsource',
                        'iframe-htmlfile']);
        }
    }

    // 3. Polling
    if (pe['xhr-polling'] && !info.null_origin) {
        protocols.push('xhr-polling');
    } else {
        if (pe['xdr-polling'] && !info.cookie_needed && !info.null_origin) {
            protocols.push('xdr-polling');
        } else {
            maybe_push(['iframe-xhr-polling',
                        'jsonp-polling']);
        }
    }
    return protocols;
}
//         [*] End of lib/utils.js


//         [*] Including lib/dom.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

// May be used by htmlfile jsonp and transports.
var MPrefix = '_sockjs_global';
utils.createHook = function() {
    var window_id = 'a' + utils.random_string(8);
    if (!(MPrefix in _window)) {
        var map = {};
        _window[MPrefix] = function(window_id) {
            if (!(window_id in map)) {
                map[window_id] = {
                    id: window_id,
                    del: function() {delete map[window_id];}
                };
            }
            return map[window_id];
        }
    }
    return _window[MPrefix](window_id);
};



utils.attachMessage = function(listener) {
    utils.attachEvent('message', listener);
};
utils.attachEvent = function(event, listener) {
    if (typeof _window.addEventListener !== 'undefined') {
        _window.addEventListener(event, listener, false);
    } else {
        // IE quirks.
        // According to: http://stevesouders.com/misc/test-postmessage.php
        // the message gets delivered only to 'document', not 'window'.
        _document.attachEvent("on" + event, listener);
        // I get 'window' for ie8.
        _window.attachEvent("on" + event, listener);
    }
};

utils.detachMessage = function(listener) {
    utils.detachEvent('message', listener);
};
utils.detachEvent = function(event, listener) {
    if (typeof _window.addEventListener !== 'undefined') {
        _window.removeEventListener(event, listener, false);
    } else {
        _document.detachEvent("on" + event, listener);
        _window.detachEvent("on" + event, listener);
    }
};


var on_unload = {};
// Things registered after beforeunload are to be called immediately.
var after_unload = false;

var trigger_unload_callbacks = function() {
    for(var ref in on_unload) {
        on_unload[ref]();
        delete on_unload[ref];
    };
};

var unload_triggered = function() {
    if(after_unload) return;
    after_unload = true;
    trigger_unload_callbacks();
};

// Onbeforeunload alone is not reliable. We could use only 'unload'
// but it's not working in opera within an iframe. Let's use both.
utils.attachEvent('beforeunload', unload_triggered);
utils.attachEvent('unload', unload_triggered);

utils.unload_add = function(listener) {
    var ref = utils.random_string(8);
    on_unload[ref] = listener;
    if (after_unload) {
        utils.delay(trigger_unload_callbacks);
    }
    return ref;
};
utils.unload_del = function(ref) {
    if (ref in on_unload)
        delete on_unload[ref];
};


utils.createIframe = function (iframe_url, error_callback) {
    var iframe = _document.createElement('iframe');
    var tref, unload_ref;
    var unattach = function() {
        clearTimeout(tref);
        // Explorer had problems with that.
        try {iframe.onload = null;} catch (x) {}
        iframe.onerror = null;
    };
    var cleanup = function() {
        if (iframe) {
            unattach();
            // This timeout makes chrome fire onbeforeunload event
            // within iframe. Without the timeout it goes straight to
            // onunload.
            setTimeout(function() {
                if(iframe) {
                    iframe.parentNode.removeChild(iframe);
                }
                iframe = null;
            }, 0);
            utils.unload_del(unload_ref);
        }
    };
    var onerror = function(r) {
        if (iframe) {
            cleanup();
            error_callback(r);
        }
    };
    var post = function(msg, origin) {
        try {
            // When the iframe is not loaded, IE raises an exception
            // on 'contentWindow'.
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage(msg, origin);
            }
        } catch (x) {};
    };

    iframe.src = iframe_url;
    iframe.style.display = 'none';
    iframe.style.position = 'absolute';
    iframe.onerror = function(){onerror('onerror');};
    iframe.onload = function() {
        // `onload` is triggered before scripts on the iframe are
        // executed. Give it few seconds to actually load stuff.
        clearTimeout(tref);
        tref = setTimeout(function(){onerror('onload timeout');}, 2000);
    };
    _document.body.appendChild(iframe);
    tref = setTimeout(function(){onerror('timeout');}, 15000);
    unload_ref = utils.unload_add(cleanup);
    return {
        post: post,
        cleanup: cleanup,
        loaded: unattach
    };
};

utils.createHtmlfile = function (iframe_url, error_callback) {
    var doc = new ActiveXObject('htmlfile');
    var tref, unload_ref;
    var iframe;
    var unattach = function() {
        clearTimeout(tref);
    };
    var cleanup = function() {
        if (doc) {
            unattach();
            utils.unload_del(unload_ref);
            iframe.parentNode.removeChild(iframe);
            iframe = doc = null;
            CollectGarbage();
        }
    };
    var onerror = function(r)  {
        if (doc) {
            cleanup();
            error_callback(r);
        }
    };
    var post = function(msg, origin) {
        try {
            // When the iframe is not loaded, IE raises an exception
            // on 'contentWindow'.
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage(msg, origin);
            }
        } catch (x) {};
    };

    doc.open();
    doc.write('<html><s' + 'cript>' +
              'document.domain="' + document.domain + '";' +
              '</s' + 'cript></html>');
    doc.close();
    doc.parentWindow[WPrefix] = _window[WPrefix];
    var c = doc.createElement('div');
    doc.body.appendChild(c);
    iframe = doc.createElement('iframe');
    c.appendChild(iframe);
    iframe.src = iframe_url;
    tref = setTimeout(function(){onerror('timeout');}, 15000);
    unload_ref = utils.unload_add(cleanup);
    return {
        post: post,
        cleanup: cleanup,
        loaded: unattach
    };
};
//         [*] End of lib/dom.js


//         [*] Including lib/dom2.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var AbstractXHRObject = function(){};
AbstractXHRObject.prototype = new EventEmitter(['chunk', 'finish']);

AbstractXHRObject.prototype._start = function(method, url, payload, opts) {
    var that = this;

    try {
        that.xhr = new XMLHttpRequest();
    } catch(x) {};

    if (!that.xhr) {
        try {
            that.xhr = new _window.ActiveXObject('Microsoft.XMLHTTP');
        } catch(x) {};
    }
    if (_window.ActiveXObject || _window.XDomainRequest) {
        // IE8 caches even POSTs
        url += ((url.indexOf('?') === -1) ? '?' : '&') + 't='+(+new Date);
    }

    // Explorer tends to keep connection open, even after the
    // tab gets closed: http://bugs.jquery.com/ticket/5280
    that.unload_ref = utils.unload_add(function(){that._cleanup(true);});
    try {
        that.xhr.open(method, url, true);
    } catch(e) {
        // IE raises an exception on wrong port.
        that.emit('finish', 0, '');
        that._cleanup();
        return;
    };

    if (!opts || !opts.no_credentials) {
        // Mozilla docs says https://developer.mozilla.org/en/XMLHttpRequest :
        // "This never affects same-site requests."
        that.xhr.withCredentials = 'true';
    }
    if (opts && opts.headers) {
        for(var key in opts.headers) {
            that.xhr.setRequestHeader(key, opts.headers[key]);
        }
    }

    that.xhr.onreadystatechange = function() {
        if (that.xhr) {
            var x = that.xhr;
            switch (x.readyState) {
            case 3:
                // IE doesn't like peeking into responseText or status
                // on Microsoft.XMLHTTP and readystate=3
                try {
                    var status = x.status;
                    var text = x.responseText;
                } catch (x) {};
                // IE does return readystate == 3 for 404 answers.
                if (text && text.length > 0) {
                    that.emit('chunk', status, text);
                }
                break;
            case 4:
                that.emit('finish', x.status, x.responseText);
                that._cleanup(false);
                break;
            }
        }
    };
    that.xhr.send(payload);
};

AbstractXHRObject.prototype._cleanup = function(abort) {
    var that = this;
    if (!that.xhr) return;
    utils.unload_del(that.unload_ref);

    // IE needs this field to be a function
    that.xhr.onreadystatechange = function(){};

    if (abort) {
        try {
            that.xhr.abort();
        } catch(x) {};
    }
    that.unload_ref = that.xhr = null;
};

AbstractXHRObject.prototype.close = function() {
    var that = this;
    that.nuke();
    that._cleanup(true);
};

var XHRCorsObject = utils.XHRCorsObject = function() {
    var that = this, args = arguments;
    utils.delay(function(){that._start.apply(that, args);});
};
XHRCorsObject.prototype = new AbstractXHRObject();

var XHRLocalObject = utils.XHRLocalObject = function(method, url, payload) {
    var that = this;
    utils.delay(function(){
        that._start(method, url, payload, {
            no_credentials: true
        });
    });
};
XHRLocalObject.prototype = new AbstractXHRObject();



// References:
//   http://ajaxian.com/archives/100-line-ajax-wrapper
//   http://msdn.microsoft.com/en-us/library/cc288060(v=VS.85).aspx
var XDRObject = utils.XDRObject = function(method, url, payload) {
    var that = this;
    utils.delay(function(){that._start(method, url, payload);});
};
XDRObject.prototype = new EventEmitter(['chunk', 'finish']);
XDRObject.prototype._start = function(method, url, payload) {
    var that = this;
    var xdr = new XDomainRequest();
    // IE caches even POSTs
    url += ((url.indexOf('?') === -1) ? '?' : '&') + 't='+(+new Date);

    var onerror = xdr.ontimeout = xdr.onerror = function() {
        that.emit('finish', 0, '');
        that._cleanup(false);
    };
    xdr.onprogress = function() {
        that.emit('chunk', 200, xdr.responseText);
    };
    xdr.onload = function() {
        that.emit('finish', 200, xdr.responseText);
        that._cleanup(false);
    };
    that.xdr = xdr;
    that.unload_ref = utils.unload_add(function(){that._cleanup(true);});
    try {
        // Fails with AccessDenied if port number is bogus
        that.xdr.open(method, url);
        that.xdr.send(payload);
    } catch(x) {
        onerror();
    }
};

XDRObject.prototype._cleanup = function(abort) {
    var that = this;
    if (!that.xdr) return;
    utils.unload_del(that.unload_ref);

    that.xdr.ontimeout = that.xdr.onerror = that.xdr.onprogress =
        that.xdr.onload = null;
    if (abort) {
        try {
            that.xdr.abort();
        } catch(x) {};
    }
    that.unload_ref = that.xdr = null;
};

XDRObject.prototype.close = function() {
    var that = this;
    that.nuke();
    that._cleanup(true);
};

// 1. Is natively via XHR
// 2. Is natively via XDR
// 3. Nope, but postMessage is there so it should work via the Iframe.
// 4. Nope, sorry.
utils.isXHRCorsCapable = function() {
    if (_window.XMLHttpRequest && 'withCredentials' in new XMLHttpRequest()) {
        return 1;
    }
    // XDomainRequest doesn't work if page is served from file://
    if (_window.XDomainRequest && _document.domain) {
        return 2;
    }
    if (IframeTransport.enabled()) {
        return 3;
    }
    return 4;
};
//         [*] End of lib/dom2.js


//         [*] Including lib/sockjs.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var SockJS = function(url, dep_protocols_whitelist, options) {
    if (this === window) {
        // makes `new` optional
        return new SockJS(url, dep_protocols_whitelist, options);
    }
    
    var that = this, protocols_whitelist;
    that._options = {devel: false, debug: false, protocols_whitelist: [],
                     info: undefined, rtt: undefined};
    if (options) {
        utils.objectExtend(that._options, options);
    }
    that._base_url = utils.amendUrl(url);
    that._server = that._options.server || utils.random_number_string(1000);
    if (that._options.protocols_whitelist &&
        that._options.protocols_whitelist.length) {
        protocols_whitelist = that._options.protocols_whitelist;
    } else {
        // Deprecated API
        if (typeof dep_protocols_whitelist === 'string' &&
            dep_protocols_whitelist.length > 0) {
            protocols_whitelist = [dep_protocols_whitelist];
        } else if (utils.isArray(dep_protocols_whitelist)) {
            protocols_whitelist = dep_protocols_whitelist
        } else {
            protocols_whitelist = null;
        }
        if (protocols_whitelist) {
            that._debug('Deprecated API: Use "protocols_whitelist" option ' +
                        'instead of supplying protocol list as a second ' +
                        'parameter to SockJS constructor.');
        }
    }
    that._protocols = [];
    that.protocol = null;
    that.readyState = SockJS.CONNECTING;
    that._ir = createInfoReceiver(that._base_url);
    that._ir.onfinish = function(info, rtt) {
        that._ir = null;
        if (info) {
            if (that._options.info) {
                // Override if user supplies the option
                info = utils.objectExtend(info, that._options.info);
            }
            if (that._options.rtt) {
                rtt = that._options.rtt;
            }
            that._applyInfo(info, rtt, protocols_whitelist);
            that._didClose();
        } else {
            that._didClose(1002, 'Can\'t connect to server', true);
        }
    };
};
// Inheritance
SockJS.prototype = new REventTarget();

SockJS.version = "0.3.1.7.ga67f.dirty";

SockJS.CONNECTING = 0;
SockJS.OPEN = 1;
SockJS.CLOSING = 2;
SockJS.CLOSED = 3;

SockJS.prototype._debug = function() {
    if (this._options.debug)
        utils.log.apply(utils, arguments);
};

SockJS.prototype._dispatchOpen = function() {
    var that = this;
    if (that.readyState === SockJS.CONNECTING) {
        if (that._transport_tref) {
            clearTimeout(that._transport_tref);
            that._transport_tref = null;
        }
        that.readyState = SockJS.OPEN;
        that.dispatchEvent(new SimpleEvent("open"));
    } else {
        // The server might have been restarted, and lost track of our
        // connection.
        that._didClose(1006, "Server lost session");
    }
};

SockJS.prototype._dispatchMessage = function(data) {
    var that = this;
    if (that.readyState !== SockJS.OPEN)
            return;
    that.dispatchEvent(new SimpleEvent("message", {data: data}));
};

SockJS.prototype._dispatchHeartbeat = function(data) {
    var that = this;
    if (that.readyState !== SockJS.OPEN)
        return;
    that.dispatchEvent(new SimpleEvent('heartbeat', {}));
};

SockJS.prototype._didClose = function(code, reason, force) {
    var that = this;
    if (that.readyState !== SockJS.CONNECTING &&
        that.readyState !== SockJS.OPEN &&
        that.readyState !== SockJS.CLOSING)
            throw new Error('INVALID_STATE_ERR');
    if (that._ir) {
        that._ir.nuke();
        that._ir = null;
    }

    if (that._transport) {
        that._transport.doCleanup();
        that._transport = null;
    }

    var close_event = new SimpleEvent("close", {
        code: code,
        reason: reason,
        wasClean: utils.userSetCode(code)});

    if (!utils.userSetCode(code) &&
        that.readyState === SockJS.CONNECTING && !force) {
        if (that._try_next_protocol(close_event)) {
            return;
        }
        close_event = new SimpleEvent("close", {code: 2000,
                                                reason: "All transports failed",
                                                wasClean: false,
                                                last_event: close_event});
    }
    that.readyState = SockJS.CLOSED;

    utils.delay(function() {
                   that.dispatchEvent(close_event);
                });
};

SockJS.prototype._didMessage = function(data) {
    var that = this;
    var type = data.slice(0, 1);
    switch(type) {
    case 'o':
        that._dispatchOpen();
        break;
    case 'a':
        var payload = JSON.parse(data.slice(1) || '[]');
        for(var i=0; i < payload.length; i++){
            that._dispatchMessage(payload[i]);
        }
        break;
    case 'm':
        var payload = JSON.parse(data.slice(1) || 'null');
        that._dispatchMessage(payload);
        break;
    case 'c':
        var payload = JSON.parse(data.slice(1) || '[]');
        that._didClose(payload[0], payload[1]);
        break;
    case 'h':
        that._dispatchHeartbeat();
        break;
    }
};

SockJS.prototype._try_next_protocol = function(close_event) {
    var that = this;
    if (that.protocol) {
        that._debug('Closed transport:', that.protocol, ''+close_event);
        that.protocol = null;
    }
    if (that._transport_tref) {
        clearTimeout(that._transport_tref);
        that._transport_tref = null;
    }

    while(1) {
        var protocol = that.protocol = that._protocols.shift();
        if (!protocol) {
            return false;
        }
        // Some protocols require access to `body`, what if were in
        // the `head`?
        if (SockJS[protocol] &&
            SockJS[protocol].need_body === true &&
            (!_document.body ||
             (typeof _document.readyState !== 'undefined'
              && _document.readyState !== 'complete'))) {
            that._protocols.unshift(protocol);
            that.protocol = 'waiting-for-load';
            utils.attachEvent('load', function(){
                that._try_next_protocol();
            });
            return true;
        }

        if (!SockJS[protocol] ||
              !SockJS[protocol].enabled(that._options)) {
            that._debug('Skipping transport:', protocol);
        } else {
            var roundTrips = SockJS[protocol].roundTrips || 1;
            var to = ((that._options.rto || 0) * roundTrips) || 5000;
            that._transport_tref = utils.delay(to, function() {
                if (that.readyState === SockJS.CONNECTING) {
                    // I can't understand how it is possible to run
                    // this timer, when the state is CLOSED, but
                    // apparently in IE everythin is possible.
                    that._didClose(2007, "Transport timeouted");
                }
            });

            var connid = utils.random_string(8);
            var trans_url = that._base_url + '/' + that._server + '/' + connid;
            that._debug('Opening transport:', protocol, ' url:'+trans_url,
                        ' RTO:'+that._options.rto);
            that._transport = new SockJS[protocol](that, trans_url,
                                                   that._base_url);
            return true;
        }
    }
};

SockJS.prototype.close = function(code, reason) {
    var that = this;
    if (code && !utils.userSetCode(code))
        throw new Error("INVALID_ACCESS_ERR");
    if(that.readyState !== SockJS.CONNECTING &&
       that.readyState !== SockJS.OPEN) {
        return false;
    }
    that.readyState = SockJS.CLOSING;
    that._didClose(code || 1000, reason || "Normal closure");
    return true;
};

SockJS.prototype.send = function(data) {
    var that = this;
    if (that.readyState === SockJS.CONNECTING)
        throw new Error('INVALID_STATE_ERR');
    if (that.readyState === SockJS.OPEN) {
        that._transport.doSend(utils.quote('' + data));
    }
    return true;
};

SockJS.prototype._applyInfo = function(info, rtt, protocols_whitelist) {
    var that = this;
    that._options.info = info;
    that._options.rtt = rtt;
    that._options.rto = utils.countRTO(rtt);
    that._options.info.null_origin = !_document.domain;
    var probed = utils.probeProtocols();
    that._protocols = utils.detectProtocols(probed, protocols_whitelist, info);
};
//         [*] End of lib/sockjs.js


//         [*] Including lib/trans-websocket.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var WebSocketTransport = SockJS.websocket = function(ri, trans_url) {
    var that = this;
    var url = trans_url + '/websocket';
    if (url.slice(0, 5) === 'https') {
        url = 'wss' + url.slice(5);
    } else {
        url = 'ws' + url.slice(4);
    }
    that.ri = ri;
    that.url = url;
    var Constructor = _window.WebSocket || _window.MozWebSocket;

    that.ws = new Constructor(that.url);
    that.ws.onmessage = function(e) {
        that.ri._didMessage(e.data);
    };
    // Firefox has an interesting bug. If a websocket connection is
    // created after onbeforeunload, it stays alive even when user
    // navigates away from the page. In such situation let's lie -
    // let's not open the ws connection at all. See:
    // https://github.com/sockjs/sockjs-client/issues/28
    // https://bugzilla.mozilla.org/show_bug.cgi?id=696085
    that.unload_ref = utils.unload_add(function(){that.ws.close()});
    that.ws.onclose = function() {
        that.ri._didMessage(utils.closeFrame(1006, "WebSocket connection broken"));
    };
};

WebSocketTransport.prototype.doSend = function(data) {
    this.ws.send('[' + data + ']');
};

WebSocketTransport.prototype.doCleanup = function() {
    var that = this;
    var ws = that.ws;
    if (ws) {
        ws.onmessage = ws.onclose = null;
        ws.close();
        utils.unload_del(that.unload_ref);
        that.unload_ref = that.ri = that.ws = null;
    }
};

WebSocketTransport.enabled = function() {
    return !!(_window.WebSocket || _window.MozWebSocket);
};

// In theory, ws should require 1 round trip. But in chrome, this is
// not very stable over SSL. Most likely a ws connection requires a
// separate SSL connection, in which case 2 round trips are an
// absolute minumum.
WebSocketTransport.roundTrips = 2;
//         [*] End of lib/trans-websocket.js


//         [*] Including lib/trans-sender.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var BufferedSender = function() {};
BufferedSender.prototype.send_constructor = function(sender) {
    var that = this;
    that.send_buffer = [];
    that.sender = sender;
};
BufferedSender.prototype.doSend = function(message) {
    var that = this;
    that.send_buffer.push(message);
    if (!that.send_stop) {
        that.send_schedule();
    }
};

// For polling transports in a situation when in the message callback,
// new message is being send. If the sending connection was started
// before receiving one, it is possible to saturate the network and
// timeout due to the lack of receiving socket. To avoid that we delay
// sending messages by some small time, in order to let receiving
// connection be started beforehand. This is only a halfmeasure and
// does not fix the big problem, but it does make the tests go more
// stable on slow networks.
BufferedSender.prototype.send_schedule_wait = function() {
    var that = this;
    var tref;
    that.send_stop = function() {
        that.send_stop = null;
        clearTimeout(tref);
    };
    tref = utils.delay(25, function() {
        that.send_stop = null;
        that.send_schedule();
    });
};

BufferedSender.prototype.send_schedule = function() {
    var that = this;
    if (that.send_buffer.length > 0) {
        var payload = '[' + that.send_buffer.join(',') + ']';
        that.send_stop = that.sender(that.trans_url,
                                     payload,
                                     function() {
                                         that.send_stop = null;
                                         that.send_schedule_wait();
                                     });
        that.send_buffer = [];
    }
};

BufferedSender.prototype.send_destructor = function() {
    var that = this;
    if (that._send_stop) {
        that._send_stop();
    }
    that._send_stop = null;
};

var jsonPGenericSender = function(url, payload, callback) {
    var that = this;

    if (!('_send_form' in that)) {
        var form = that._send_form = _document.createElement('form');
        var area = that._send_area = _document.createElement('textarea');
        area.name = 'd';
        form.style.display = 'none';
        form.style.position = 'absolute';
        form.method = 'POST';
        form.enctype = 'application/x-www-form-urlencoded';
        form.acceptCharset = "UTF-8";
        form.appendChild(area);
        _document.body.appendChild(form);
    }
    var form = that._send_form;
    var area = that._send_area;
    var id = 'a' + utils.random_string(8);
    form.target = id;
    form.action = url + '/jsonp_send?i=' + id;

    var iframe;
    try {
        // ie6 dynamic iframes with target="" support (thanks Chris Lambacher)
        iframe = _document.createElement('<iframe name="'+ id +'">');
    } catch(x) {
        iframe = _document.createElement('iframe');
        iframe.name = id;
    }
    iframe.id = id;
    form.appendChild(iframe);
    iframe.style.display = 'none';

    try {
        area.value = payload;
    } catch(e) {
        utils.log('Your browser is seriously broken. Go home! ' + e.message);
    }
    form.submit();

    var completed = function(e) {
        if (!iframe.onerror) return;
        iframe.onreadystatechange = iframe.onerror = iframe.onload = null;
        // Opera mini doesn't like if we GC iframe
        // immediately, thus this timeout.
        utils.delay(500, function() {
                       iframe.parentNode.removeChild(iframe);
                       iframe = null;
                   });
        area.value = '';
        callback();
    };
    iframe.onerror = iframe.onload = completed;
    iframe.onreadystatechange = function(e) {
        if (iframe.readyState == 'complete') completed();
    };
    return completed;
};

var createAjaxSender = function(AjaxObject) {
    return function(url, payload, callback) {
        var xo = new AjaxObject('POST', url + '/xhr_send', payload);
        xo.onfinish = function(status, text) {
            callback(status);
        };
        return function(abort_reason) {
            callback(0, abort_reason);
        };
    };
};
//         [*] End of lib/trans-sender.js


//         [*] Including lib/trans-jsonp-receiver.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

// Parts derived from Socket.io:
//    https://github.com/LearnBoost/socket.io/blob/0.6.17/lib/socket.io/transports/jsonp-polling.js
// and jQuery-JSONP:
//    https://code.google.com/p/jquery-jsonp/source/browse/trunk/core/jquery.jsonp.js
var jsonPGenericReceiver = function(url, callback) {
    var tref;
    var script = _document.createElement('script');
    var script2;  // Opera synchronous load trick.
    var close_script = function(frame) {
        if (script2) {
            script2.parentNode.removeChild(script2);
            script2 = null;
        }
        if (script) {
            clearTimeout(tref);
            script.parentNode.removeChild(script);
            script.onreadystatechange = script.onerror =
                script.onload = script.onclick = null;
            script = null;
            callback(frame);
            callback = null;
        }
    };

    // IE9 fires 'error' event after orsc or before, in random order.
    var loaded_okay = false;
    var error_timer = null;

    script.id = 'a' + utils.random_string(8);
    script.src = url;
    script.type = 'text/javascript';
    script.charset = 'UTF-8';
    script.onerror = function(e) {
        if (!error_timer) {
            // Delay firing close_script.
            error_timer = setTimeout(function() {
                if (!loaded_okay) {
                    close_script(utils.closeFrame(
                        1006,
                        "JSONP script loaded abnormally (onerror)"));
                }
            }, 1000);
        }
    };
    script.onload = function(e) {
        close_script(utils.closeFrame(1006, "JSONP script loaded abnormally (onload)"));
    };

    script.onreadystatechange = function(e) {
        if (/loaded|closed/.test(script.readyState)) {
            if (script && script.htmlFor && script.onclick) {
                loaded_okay = true;
                try {
                    // In IE, actually execute the script.
                    script.onclick();
                } catch (x) {}
            }
            if (script) {
                close_script(utils.closeFrame(1006, "JSONP script loaded abnormally (onreadystatechange)"));
            }
        }
    };
    // IE: event/htmlFor/onclick trick.
    // One can't rely on proper order for onreadystatechange. In order to
    // make sure, set a 'htmlFor' and 'event' properties, so that
    // script code will be installed as 'onclick' handler for the
    // script object. Later, onreadystatechange, manually execute this
    // code. FF and Chrome doesn't work with 'event' and 'htmlFor'
    // set. For reference see:
    //   http://jaubourg.net/2010/07/loading-script-as-onclick-handler-of.html
    // Also, read on that about script ordering:
    //   http://wiki.whatwg.org/wiki/Dynamic_Script_Execution_Order
    if (typeof script.async === 'undefined' && _document.attachEvent) {
        // According to mozilla docs, in recent browsers script.async defaults
        // to 'true', so we may use it to detect a good browser:
        // https://developer.mozilla.org/en/HTML/Element/script
        if (!/opera/i.test(navigator.userAgent)) {
            // Naively assume we're in IE
            try {
                script.htmlFor = script.id;
                script.event = "onclick";
            } catch (x) {}
            script.async = true;
        } else {
            // Opera, second sync script hack
            script2 = _document.createElement('script');
            script2.text = "try{var a = document.getElementById('"+script.id+"'); if(a)a.onerror();}catch(x){};";
            script.async = script2.async = false;
        }
    }
    if (typeof script.async !== 'undefined') {
        script.async = true;
    }

    // Fallback mostly for Konqueror - stupid timer, 35 seconds shall be plenty.
    tref = setTimeout(function() {
                          close_script(utils.closeFrame(1006, "JSONP script loaded abnormally (timeout)"));
                      }, 35000);

    var head = _document.getElementsByTagName('head')[0];
    head.insertBefore(script, head.firstChild);
    if (script2) {
        head.insertBefore(script2, head.firstChild);
    }
    return close_script;
};
//         [*] End of lib/trans-jsonp-receiver.js


//         [*] Including lib/trans-jsonp-polling.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

// The simplest and most robust transport, using the well-know cross
// domain hack - JSONP. This transport is quite inefficient - one
// mssage could use up to one http request. But at least it works almost
// everywhere.
// Known limitations:
//   o you will get a spinning cursor
//   o for Konqueror a dumb timer is needed to detect errors


var JsonPTransport = SockJS['jsonp-polling'] = function(ri, trans_url) {
    utils.polluteGlobalNamespace();
    var that = this;
    that.ri = ri;
    that.trans_url = trans_url;
    that.send_constructor(jsonPGenericSender);
    that._schedule_recv();
};

// Inheritnace
JsonPTransport.prototype = new BufferedSender();

JsonPTransport.prototype._schedule_recv = function() {
    var that = this;
    var callback = function(data) {
        that._recv_stop = null;
        if (data) {
            // no data - heartbeat;
            if (!that._is_closing) {
                that.ri._didMessage(data);
            }
        }
        // The message can be a close message, and change is_closing state.
        if (!that._is_closing) {
            that._schedule_recv();
        }
    };
    that._recv_stop = jsonPReceiverWrapper(that.trans_url + '/jsonp',
                                           jsonPGenericReceiver, callback);
};

JsonPTransport.enabled = function() {
    return true;
};

JsonPTransport.need_body = true;


JsonPTransport.prototype.doCleanup = function() {
    var that = this;
    that._is_closing = true;
    if (that._recv_stop) {
        that._recv_stop();
    }
    that.ri = that._recv_stop = null;
    that.send_destructor();
};


// Abstract away code that handles global namespace pollution.
var jsonPReceiverWrapper = function(url, constructReceiver, user_callback) {
    var id = 'a' + utils.random_string(6);
    var url_id = url + '?c=' + escape(WPrefix + '.' + id);
    // Callback will be called exactly once.
    var callback = function(frame) {
        delete _window[WPrefix][id];
        user_callback(frame);
    };

    var close_script = constructReceiver(url_id, callback);
    _window[WPrefix][id] = close_script;
    var stop = function() {
        if (_window[WPrefix][id]) {
            _window[WPrefix][id](utils.closeFrame(1000, "JSONP user aborted read"));
        }
    };
    return stop;
};
//         [*] End of lib/trans-jsonp-polling.js


//         [*] Including lib/trans-xhr.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var AjaxBasedTransport = function() {};
AjaxBasedTransport.prototype = new BufferedSender();

AjaxBasedTransport.prototype.run = function(ri, trans_url,
                                            url_suffix, Receiver, AjaxObject) {
    var that = this;
    that.ri = ri;
    that.trans_url = trans_url;
    that.send_constructor(createAjaxSender(AjaxObject));
    that.poll = new Polling(ri, Receiver,
                            trans_url + url_suffix, AjaxObject);
};

AjaxBasedTransport.prototype.doCleanup = function() {
    var that = this;
    if (that.poll) {
        that.poll.abort();
        that.poll = null;
    }
};

// xhr-streaming
var XhrStreamingTransport = SockJS['xhr-streaming'] = function(ri, trans_url) {
    this.run(ri, trans_url, '/xhr_streaming', XhrReceiver, utils.XHRCorsObject);
};

XhrStreamingTransport.prototype = new AjaxBasedTransport();

XhrStreamingTransport.enabled = function() {
    // Support for CORS Ajax aka Ajax2? Opera 12 claims CORS but
    // doesn't do streaming.
    return (_window.XMLHttpRequest &&
            'withCredentials' in new XMLHttpRequest() &&
            (!/opera/i.test(navigator.userAgent)));
};
XhrStreamingTransport.roundTrips = 2; // preflight, ajax

// Safari gets confused when a streaming ajax request is started
// before onload. This causes the load indicator to spin indefinetely.
XhrStreamingTransport.need_body = true;


// According to:
//   http://stackoverflow.com/questions/1641507/detect-browser-support-for-cross-domain-xmlhttprequests
//   http://hacks.mozilla.org/2009/07/cross-site-xmlhttprequest-with-cors/


// xdr-streaming
var XdrStreamingTransport = SockJS['xdr-streaming'] = function(ri, trans_url) {
    this.run(ri, trans_url, '/xhr_streaming', XhrReceiver, utils.XDRObject);
};

XdrStreamingTransport.prototype = new AjaxBasedTransport();

XdrStreamingTransport.enabled = function() {
    return !!_window.XDomainRequest;
};
XdrStreamingTransport.roundTrips = 2; // preflight, ajax



// xhr-polling
var XhrPollingTransport = SockJS['xhr-polling'] = function(ri, trans_url) {
    this.run(ri, trans_url, '/xhr', XhrReceiver, utils.XHRCorsObject);
};

XhrPollingTransport.prototype = new AjaxBasedTransport();

XhrPollingTransport.enabled = XhrStreamingTransport.enabled;
XhrPollingTransport.roundTrips = 2; // preflight, ajax


// xdr-polling
var XdrPollingTransport = SockJS['xdr-polling'] = function(ri, trans_url) {
    this.run(ri, trans_url, '/xhr', XhrReceiver, utils.XDRObject);
};

XdrPollingTransport.prototype = new AjaxBasedTransport();

XdrPollingTransport.enabled = XdrStreamingTransport.enabled;
XdrPollingTransport.roundTrips = 2; // preflight, ajax
//         [*] End of lib/trans-xhr.js


//         [*] Including lib/trans-iframe.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

// Few cool transports do work only for same-origin. In order to make
// them working cross-domain we shall use iframe, served form the
// remote domain. New browsers, have capabilities to communicate with
// cross domain iframe, using postMessage(). In IE it was implemented
// from IE 8+, but of course, IE got some details wrong:
//    http://msdn.microsoft.com/en-us/library/cc197015(v=VS.85).aspx
//    http://stevesouders.com/misc/test-postmessage.php

var IframeTransport = function() {};

IframeTransport.prototype.i_constructor = function(ri, trans_url, base_url) {
    var that = this;
    that.ri = ri;
    that.origin = utils.getOrigin(base_url);
    that.base_url = base_url;
    that.trans_url = trans_url;

    var iframe_url = base_url + '/iframe.html';
    if (that.ri._options.devel) {
        iframe_url += '?t=' + (+new Date);
    }
    that.window_id = utils.random_string(8);
    iframe_url += '#' + that.window_id;

    that.iframeObj = utils.createIframe(iframe_url, function(r) {
                                            that.ri._didClose(1006, "Unable to load an iframe (" + r + ")");
                                        });

    that.onmessage_cb = utils.bind(that.onmessage, that);
    utils.attachMessage(that.onmessage_cb);
};

IframeTransport.prototype.doCleanup = function() {
    var that = this;
    if (that.iframeObj) {
        utils.detachMessage(that.onmessage_cb);
        try {
            // When the iframe is not loaded, IE raises an exception
            // on 'contentWindow'.
            if (that.iframeObj.iframe.contentWindow) {
                that.postMessage('c');
            }
        } catch (x) {}
        that.iframeObj.cleanup();
        that.iframeObj = null;
        that.onmessage_cb = that.iframeObj = null;
    }
};

IframeTransport.prototype.onmessage = function(e) {
    var that = this;
    if (e.origin !== that.origin) return;
    var window_id = e.data.slice(0, 8);
    var type = e.data.slice(8, 9);
    var data = e.data.slice(9);

    if (window_id !== that.window_id) return;

    switch(type) {
    case 's':
        that.iframeObj.loaded();
        that.postMessage('s', JSON.stringify([SockJS.version, that.protocol, that.trans_url, that.base_url]));
        break;
    case 't':
        that.ri._didMessage(data);
        break;
    }
};

IframeTransport.prototype.postMessage = function(type, data) {
    var that = this;
    that.iframeObj.post(that.window_id + type + (data || ''), that.origin);
};

IframeTransport.prototype.doSend = function (message) {
    this.postMessage('m', message);
};

IframeTransport.enabled = function() {
    // postMessage misbehaves in konqueror 4.6.5 - the messages are delivered with
    // huge delay, or not at all.
    var konqueror = navigator && navigator.userAgent && navigator.userAgent.indexOf('Konqueror') !== -1;
    return ((typeof _window.postMessage === 'function' ||
            typeof _window.postMessage === 'object') && (!konqueror));
};
//         [*] End of lib/trans-iframe.js


//         [*] Including lib/trans-iframe-within.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var curr_window_id;

var postMessage = function (type, data) {
    if(parent !== _window) {
        parent.postMessage(curr_window_id + type + (data || ''), '*');
    } else {
        utils.log("Can't postMessage, no parent window.", type, data);
    }
};

var FacadeJS = function() {};
FacadeJS.prototype._didClose = function (code, reason) {
    postMessage('t', utils.closeFrame(code, reason));
};
FacadeJS.prototype._didMessage = function (frame) {
    postMessage('t', frame);
};
FacadeJS.prototype._doSend = function (data) {
    this._transport.doSend(data);
};
FacadeJS.prototype._doCleanup = function () {
    this._transport.doCleanup();
};

utils.parent_origin = undefined;

SockJS.bootstrap_iframe = function() {
    var facade;
    curr_window_id = _document.location.hash.slice(1);
    var onMessage = function(e) {
        if(e.source !== parent) return;
        if(typeof utils.parent_origin === 'undefined')
            utils.parent_origin = e.origin;
        if (e.origin !== utils.parent_origin) return;

        var window_id = e.data.slice(0, 8);
        var type = e.data.slice(8, 9);
        var data = e.data.slice(9);
        if (window_id !== curr_window_id) return;
        switch(type) {
        case 's':
            var p = JSON.parse(data);
            var version = p[0];
            var protocol = p[1];
            var trans_url = p[2];
            var base_url = p[3];
            if (version !== SockJS.version) {
                utils.log("Incompatibile SockJS! Main site uses:" +
                          " \"" + version + "\", the iframe:" +
                          " \"" + SockJS.version + "\".");
            }
            if (!utils.flatUrl(trans_url) || !utils.flatUrl(base_url)) {
                utils.log("Only basic urls are supported in SockJS");
                return;
            }

            if (!utils.isSameOriginUrl(trans_url) ||
                !utils.isSameOriginUrl(base_url)) {
                utils.log("Can't connect to different domain from within an " +
                          "iframe. (" + JSON.stringify([_window.location.href, trans_url, base_url]) +
                          ")");
                return;
            }
            facade = new FacadeJS();
            facade._transport = new FacadeJS[protocol](facade, trans_url, base_url);
            break;
        case 'm':
            facade._doSend(data);
            break;
        case 'c':
            if (facade)
                facade._doCleanup();
            facade = null;
            break;
        }
    };

    // alert('test ticker');
    // facade = new FacadeJS();
    // facade._transport = new FacadeJS['w-iframe-xhr-polling'](facade, 'http://host.com:9999/ticker/12/basd');

    utils.attachMessage(onMessage);

    // Start
    postMessage('s');
};
//         [*] End of lib/trans-iframe-within.js


//         [*] Including lib/info.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var InfoReceiver = function(base_url, AjaxObject) {
    var that = this;
    utils.delay(function(){that.doXhr(base_url, AjaxObject);});
};

InfoReceiver.prototype = new EventEmitter(['finish']);

InfoReceiver.prototype.doXhr = function(base_url, AjaxObject) {
    var that = this;
    var t0 = (new Date()).getTime();
    var xo = new AjaxObject('GET', base_url + '/info');

    var tref = utils.delay(8000,
                           function(){xo.ontimeout();});

    xo.onfinish = function(status, text) {
        clearTimeout(tref);
        tref = null;
        if (status === 200) {
            var rtt = (new Date()).getTime() - t0;
            var info = JSON.parse(text);
            if (typeof info !== 'object') info = {};
            that.emit('finish', info, rtt);
        } else {
            that.emit('finish');
        }
    };
    xo.ontimeout = function() {
        xo.close();
        that.emit('finish');
    };
};

var InfoReceiverIframe = function(base_url) {
    var that = this;
    var go = function() {
        var ifr = new IframeTransport();
        ifr.protocol = 'w-iframe-info-receiver';
        var fun = function(r) {
            if (typeof r === 'string' && r.substr(0,1) === 'm') {
                var d = JSON.parse(r.substr(1));
                var info = d[0], rtt = d[1];
                that.emit('finish', info, rtt);
            } else {
                that.emit('finish');
            }
            ifr.doCleanup();
            ifr = null;
        };
        var mock_ri = {
            _options: {},
            _didClose: fun,
            _didMessage: fun
        };
        ifr.i_constructor(mock_ri, base_url, base_url);
    }
    if(!_document.body) {
        utils.attachEvent('load', go);
    } else {
        go();
    }
};
InfoReceiverIframe.prototype = new EventEmitter(['finish']);


var InfoReceiverFake = function() {
    // It may not be possible to do cross domain AJAX to get the info
    // data, for example for IE7. But we want to run JSONP, so let's
    // fake the response, with rtt=2s (rto=6s).
    var that = this;
    utils.delay(function() {
        that.emit('finish', {}, 2000);
    });
};
InfoReceiverFake.prototype = new EventEmitter(['finish']);

var createInfoReceiver = function(base_url) {
    if (utils.isSameOriginUrl(base_url)) {
        // If, for some reason, we have SockJS locally - there's no
        // need to start up the complex machinery. Just use ajax.
        return new InfoReceiver(base_url, utils.XHRLocalObject);
    }
    switch (utils.isXHRCorsCapable()) {
    case 1:
        return new InfoReceiver(base_url, utils.XHRCorsObject);
    case 2:
        return new InfoReceiver(base_url, utils.XDRObject);
    case 3:
        // Opera
        return new InfoReceiverIframe(base_url);
    default:
        // IE 7
        return new InfoReceiverFake();
    };
};


var WInfoReceiverIframe = FacadeJS['w-iframe-info-receiver'] = function(ri, _trans_url, base_url) {
    var ir = new InfoReceiver(base_url, utils.XHRLocalObject);
    ir.onfinish = function(info, rtt) {
        ri._didMessage('m'+JSON.stringify([info, rtt]));
        ri._didClose();
    }
};
WInfoReceiverIframe.prototype.doCleanup = function() {};
//         [*] End of lib/info.js


//         [*] Including lib/trans-iframe-eventsource.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var EventSourceIframeTransport = SockJS['iframe-eventsource'] = function () {
    var that = this;
    that.protocol = 'w-iframe-eventsource';
    that.i_constructor.apply(that, arguments);
};

EventSourceIframeTransport.prototype = new IframeTransport();

EventSourceIframeTransport.enabled = function () {
    return ('EventSource' in _window) && IframeTransport.enabled();
};

EventSourceIframeTransport.need_body = true;
EventSourceIframeTransport.roundTrips = 3; // html, javascript, eventsource


// w-iframe-eventsource
var EventSourceTransport = FacadeJS['w-iframe-eventsource'] = function(ri, trans_url) {
    this.run(ri, trans_url, '/eventsource', EventSourceReceiver, utils.XHRLocalObject);
}
EventSourceTransport.prototype = new AjaxBasedTransport();
//         [*] End of lib/trans-iframe-eventsource.js


//         [*] Including lib/trans-iframe-xhr-polling.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var XhrPollingIframeTransport = SockJS['iframe-xhr-polling'] = function () {
    var that = this;
    that.protocol = 'w-iframe-xhr-polling';
    that.i_constructor.apply(that, arguments);
};

XhrPollingIframeTransport.prototype = new IframeTransport();

XhrPollingIframeTransport.enabled = function () {
    return _window.XMLHttpRequest && IframeTransport.enabled();
};

XhrPollingIframeTransport.need_body = true;
XhrPollingIframeTransport.roundTrips = 3; // html, javascript, xhr


// w-iframe-xhr-polling
var XhrPollingITransport = FacadeJS['w-iframe-xhr-polling'] = function(ri, trans_url) {
    this.run(ri, trans_url, '/xhr', XhrReceiver, utils.XHRLocalObject);
};

XhrPollingITransport.prototype = new AjaxBasedTransport();
//         [*] End of lib/trans-iframe-xhr-polling.js


//         [*] Including lib/trans-iframe-htmlfile.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

// This transport generally works in any browser, but will cause a
// spinning cursor to appear in any browser other than IE.
// We may test this transport in all browsers - why not, but in
// production it should be only run in IE.

var HtmlFileIframeTransport = SockJS['iframe-htmlfile'] = function () {
    var that = this;
    that.protocol = 'w-iframe-htmlfile';
    that.i_constructor.apply(that, arguments);
};

// Inheritance.
HtmlFileIframeTransport.prototype = new IframeTransport();

HtmlFileIframeTransport.enabled = function() {
    return IframeTransport.enabled();
};

HtmlFileIframeTransport.need_body = true;
HtmlFileIframeTransport.roundTrips = 3; // html, javascript, htmlfile


// w-iframe-htmlfile
var HtmlFileTransport = FacadeJS['w-iframe-htmlfile'] = function(ri, trans_url) {
    this.run(ri, trans_url, '/htmlfile', HtmlfileReceiver, utils.XHRLocalObject);
};
HtmlFileTransport.prototype = new AjaxBasedTransport();
//         [*] End of lib/trans-iframe-htmlfile.js


//         [*] Including lib/trans-polling.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var Polling = function(ri, Receiver, recv_url, AjaxObject) {
    var that = this;
    that.ri = ri;
    that.Receiver = Receiver;
    that.recv_url = recv_url;
    that.AjaxObject = AjaxObject;
    that._scheduleRecv();
};

Polling.prototype._scheduleRecv = function() {
    var that = this;
    var poll = that.poll = new that.Receiver(that.recv_url, that.AjaxObject);
    var msg_counter = 0;
    poll.onmessage = function(e) {
        msg_counter += 1;
        that.ri._didMessage(e.data);
    };
    poll.onclose = function(e) {
        that.poll = poll = poll.onmessage = poll.onclose = null;
        if (!that.poll_is_closing) {
            if (e.reason === 'permanent') {
                that.ri._didClose(1006, 'Polling error (' + e.reason + ')');
            } else {
                that._scheduleRecv();
            }
        }
    };
};

Polling.prototype.abort = function() {
    var that = this;
    that.poll_is_closing = true;
    if (that.poll) {
        that.poll.abort();
    }
};
//         [*] End of lib/trans-polling.js


//         [*] Including lib/trans-receiver-eventsource.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var EventSourceReceiver = function(url) {
    var that = this;
    var es = new EventSource(url);
    es.onmessage = function(e) {
        that.dispatchEvent(new SimpleEvent('message',
                                           {'data': unescape(e.data)}));
    };
    that.es_close = es.onerror = function(e, abort_reason) {
        // ES on reconnection has readyState = 0 or 1.
        // on network error it's CLOSED = 2
        var reason = abort_reason ? 'user' :
            (es.readyState !== 2 ? 'network' : 'permanent');
        that.es_close = es.onmessage = es.onerror = null;
        // EventSource reconnects automatically.
        es.close();
        es = null;
        // Safari and chrome < 15 crash if we close window before
        // waiting for ES cleanup. See:
        //   https://code.google.com/p/chromium/issues/detail?id=89155
        utils.delay(200, function() {
                        that.dispatchEvent(new SimpleEvent('close', {reason: reason}));
                    });
    };
};

EventSourceReceiver.prototype = new REventTarget();

EventSourceReceiver.prototype.abort = function() {
    var that = this;
    if (that.es_close) {
        that.es_close({}, true);
    }
};
//         [*] End of lib/trans-receiver-eventsource.js


//         [*] Including lib/trans-receiver-htmlfile.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var _is_ie_htmlfile_capable;
var isIeHtmlfileCapable = function() {
    if (_is_ie_htmlfile_capable === undefined) {
        if ('ActiveXObject' in _window) {
            try {
                _is_ie_htmlfile_capable = !!new ActiveXObject('htmlfile');
            } catch (x) {}
        } else {
            _is_ie_htmlfile_capable = false;
        }
    }
    return _is_ie_htmlfile_capable;
};


var HtmlfileReceiver = function(url) {
    var that = this;
    utils.polluteGlobalNamespace();

    that.id = 'a' + utils.random_string(6, 26);
    url += ((url.indexOf('?') === -1) ? '?' : '&') +
        'c=' + escape(WPrefix + '.' + that.id);

    var constructor = isIeHtmlfileCapable() ?
        utils.createHtmlfile : utils.createIframe;

    var iframeObj;
    _window[WPrefix][that.id] = {
        start: function () {
            iframeObj.loaded();
        },
        message: function (data) {
            that.dispatchEvent(new SimpleEvent('message', {'data': data}));
        },
        stop: function () {
            that.iframe_close({}, 'network');
        }
    };
    that.iframe_close = function(e, abort_reason) {
        iframeObj.cleanup();
        that.iframe_close = iframeObj = null;
        delete _window[WPrefix][that.id];
        that.dispatchEvent(new SimpleEvent('close', {reason: abort_reason}));
    };
    iframeObj = constructor(url, function(e) {
                                that.iframe_close({}, 'permanent');
                            });
};

HtmlfileReceiver.prototype = new REventTarget();

HtmlfileReceiver.prototype.abort = function() {
    var that = this;
    if (that.iframe_close) {
        that.iframe_close({}, 'user');
    }
};
//         [*] End of lib/trans-receiver-htmlfile.js


//         [*] Including lib/trans-receiver-xhr.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

var XhrReceiver = function(url, AjaxObject) {
    var that = this;
    var buf_pos = 0;

    that.xo = new AjaxObject('POST', url, null);
    that.xo.onchunk = function(status, text) {
        if (status !== 200) return;
        while (1) {
            var buf = text.slice(buf_pos);
            var p = buf.indexOf('\n');
            if (p === -1) break;
            buf_pos += p+1;
            var msg = buf.slice(0, p);
            that.dispatchEvent(new SimpleEvent('message', {data: msg}));
        }
    };
    that.xo.onfinish = function(status, text) {
        that.xo.onchunk(status, text);
        that.xo = null;
        var reason = status === 200 ? 'network' : 'permanent';
        that.dispatchEvent(new SimpleEvent('close', {reason: reason}));
    }
};

XhrReceiver.prototype = new REventTarget();

XhrReceiver.prototype.abort = function() {
    var that = this;
    if (that.xo) {
        that.xo.close();
        that.dispatchEvent(new SimpleEvent('close', {reason: 'user'}));
        that.xo = null;
    }
};
//         [*] End of lib/trans-receiver-xhr.js


//         [*] Including lib/test-hooks.js
/*
 * ***** BEGIN LICENSE BLOCK *****
 * Copyright (c) 2011-2012 VMware, Inc.
 *
 * For the license see COPYING.
 * ***** END LICENSE BLOCK *****
 */

// For testing
SockJS.getUtils = function(){
    return utils;
};

SockJS.getIframeTransport = function(){
    return IframeTransport;
};
//         [*] End of lib/test-hooks.js

                  return SockJS;
          })();
if ('_sockjs_onload' in window) setTimeout(_sockjs_onload, 1);

// AMD compliance
if (typeof define === 'function' && define.amd) {
    define('sockjs', [], function(){return SockJS;});
}

if (typeof module === 'object' && module && module.exports) {
    module.exports = SockJS;
}
//     [*] End of lib/index.js

// [*] End of lib/all.js


});

require.define("/node_modules/domready/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./ready.js"}
});

require.define("/node_modules/domready/ready.js",function(require,module,exports,__dirname,__filename,process,global){/*!
  * domready (c) Dustin Diaz 2012 - License MIT
  */
!function (name, definition) {
  if (typeof module != 'undefined') module.exports = definition()
  else if (typeof define == 'function' && typeof define.amd == 'object') define(definition)
  else this[name] = definition()
}('domready', function (ready) {

  var fns = [], fn, f = false
    , doc = document
    , testEl = doc.documentElement
    , hack = testEl.doScroll
    , domContentLoaded = 'DOMContentLoaded'
    , addEventListener = 'addEventListener'
    , onreadystatechange = 'onreadystatechange'
    , readyState = 'readyState'
    , loaded = /^loade|c/.test(doc[readyState])

  function flush(f) {
    loaded = 1
    while (f = fns.shift()) f()
  }

  doc[addEventListener] && doc[addEventListener](domContentLoaded, fn = function () {
    doc.removeEventListener(domContentLoaded, fn, f)
    flush()
  }, f)


  hack && doc.attachEvent(onreadystatechange, fn = function () {
    if (/^c/.test(doc[readyState])) {
      doc.detachEvent(onreadystatechange, fn)
      flush()
    }
  })

  return (ready = hack ?
    function (fn) {
      self != top ?
        loaded ? fn() : fns.push(fn) :
        function () {
          try {
            testEl.doScroll('left')
          } catch (e) {
            return setTimeout(function() { ready(fn) }, 50)
          }
          fn()
        }()
    } :
    function (fn) {
      loaded ? fn() : fns.push(fn)
    })
})
});

require.define("/node_modules/lodash/package.json",function(require,module,exports,__dirname,__filename,process,global){module.exports = {"main":"./lodash"}
});

require.define("/node_modules/lodash/lodash.js",function(require,module,exports,__dirname,__filename,process,global){/*!
 * Lo-Dash 0.10.0 <http://lodash.com>
 * (c) 2012 John-David Dalton <http://allyoucanleet.com/>
 * Based on Underscore.js 1.4.2 <http://underscorejs.org>
 * (c) 2009-2012 Jeremy Ashkenas, DocumentCloud Inc.
 * Available under MIT license <http://lodash.com/license>
 */
;(function(window, undefined) {

  /** Detect free variable `exports` */
  var freeExports = typeof exports == 'object' && exports;

  /** Detect free variable `global` and use it as `window` */
  var freeGlobal = typeof global == 'object' && global;
  if (freeGlobal.global === freeGlobal) {
    window = freeGlobal;
  }

  /** Used for array and object method references */
  var arrayRef = [],
      // avoid a Closure Compiler bug by creatively creating an object
      objectRef = new function(){};

  /** Used to generate unique IDs */
  var idCounter = 0;

  /** Used internally to indicate various things */
  var indicatorObject = objectRef;

  /** Used by `cachedContains` as the default size when optimizations are enabled for large arrays */
  var largeArraySize = 30;

  /** Used to restore the original `_` reference in `noConflict` */
  var oldDash = window._;

  /** Used to detect template delimiter values that require a with-statement */
  var reComplexDelimiter = /[-?+=!~*%&^<>|{(\/]|\[\D|\b(?:delete|in|instanceof|new|typeof|void)\b/;

  /** Used to match HTML entities */
  var reEscapedHtml = /&(?:amp|lt|gt|quot|#x27);/g;

  /** Used to match empty string literals in compiled template source */
  var reEmptyStringLeading = /\b__p \+= '';/g,
      reEmptyStringMiddle = /\b(__p \+=) '' \+/g,
      reEmptyStringTrailing = /(__e\(.*?\)|\b__t\)) \+\n'';/g;

  /** Used to match regexp flags from their coerced string values */
  var reFlags = /\w*$/;

  /** Used to insert the data object variable into compiled template source */
  var reInsertVariable = /(?:__e|__t = )\(\s*(?![\d\s"']|this\.)/g;

  /** Used to detect if a method is native */
  var reNative = RegExp('^' +
    (objectRef.valueOf + '')
      .replace(/[.*+?^=!:${}()|[\]\/\\]/g, '\\$&')
      .replace(/valueOf|for [^\]]+/g, '.+?') + '$'
  );

  /**
   * Used to match ES6 template delimiters
   * http://people.mozilla.org/~jorendorff/es6-draft.html#sec-7.8.6
   */
  var reEsTemplate = /\$\{((?:(?=\\?)\\?[\s\S])*?)}/g;

  /** Used to match "interpolate" template delimiters */
  var reInterpolate = /<%=([\s\S]+?)%>/g;

  /** Used to ensure capturing order of template delimiters */
  var reNoMatch = /($^)/;

  /** Used to match HTML characters */
  var reUnescapedHtml = /[&<>"']/g;

  /** Used to match unescaped characters in compiled string literals */
  var reUnescapedString = /['\n\r\t\u2028\u2029\\]/g;

  /** Used to fix the JScript [[DontEnum]] bug */
  var shadowed = [
    'constructor', 'hasOwnProperty', 'isPrototypeOf', 'propertyIsEnumerable',
    'toLocaleString', 'toString', 'valueOf'
  ];

  /** Used to make template sourceURLs easier to identify */
  var templateCounter = 0;

  /** Native method shortcuts */
  var ceil = Math.ceil,
      concat = arrayRef.concat,
      floor = Math.floor,
      getPrototypeOf = reNative.test(getPrototypeOf = Object.getPrototypeOf) && getPrototypeOf,
      hasOwnProperty = objectRef.hasOwnProperty,
      push = arrayRef.push,
      propertyIsEnumerable = objectRef.propertyIsEnumerable,
      slice = arrayRef.slice,
      toString = objectRef.toString;

  /* Native method shortcuts for methods with the same name as other `lodash` methods */
  var nativeBind = reNative.test(nativeBind = slice.bind) && nativeBind,
      nativeIsArray = reNative.test(nativeIsArray = Array.isArray) && nativeIsArray,
      nativeIsFinite = window.isFinite,
      nativeIsNaN = window.isNaN,
      nativeKeys = reNative.test(nativeKeys = Object.keys) && nativeKeys,
      nativeMax = Math.max,
      nativeMin = Math.min,
      nativeRandom = Math.random;

  /** `Object#toString` result shortcuts */
  var argsClass = '[object Arguments]',
      arrayClass = '[object Array]',
      boolClass = '[object Boolean]',
      dateClass = '[object Date]',
      funcClass = '[object Function]',
      numberClass = '[object Number]',
      objectClass = '[object Object]',
      regexpClass = '[object RegExp]',
      stringClass = '[object String]';

  /**
   * Detect the JScript [[DontEnum]] bug:
   *
   * In IE < 9 an objects own properties, shadowing non-enumerable ones, are
   * made non-enumerable as well.
   */
  var hasDontEnumBug;

  /** Detect if own properties are iterated after inherited properties (IE < 9) */
  var iteratesOwnLast;

  /**
   * Detect if `Array#shift` and `Array#splice` augment array-like objects
   * incorrectly:
   *
   * Firefox < 10, IE compatibility mode, and IE < 9 have buggy Array `shift()`
   * and `splice()` functions that fail to remove the last element, `value[0]`,
   * of array-like objects even though the `length` property is set to `0`.
   * The `shift()` method is buggy in IE 8 compatibility mode, while `splice()`
   * is buggy regardless of mode in IE < 9 and buggy in compatibility mode in IE 9.
   */
  var hasObjectSpliceBug = (hasObjectSpliceBug = { '0': 1, 'length': 1 },
    arrayRef.splice.call(hasObjectSpliceBug, 0, 1), hasObjectSpliceBug[0]);

  /** Detect if an `arguments` object's indexes are non-enumerable (IE < 9) */
  var noArgsEnum = true;

  (function() {
    var props = [];
    function ctor() { this.x = 1; }
    ctor.prototype = { 'valueOf': 1, 'y': 1 };
    for (var prop in new ctor) { props.push(prop); }
    for (prop in arguments) { noArgsEnum = !prop; }

    hasDontEnumBug = !/valueOf/.test(props);
    iteratesOwnLast = props[0] != 'x';
  }(1));

  /** Detect if an `arguments` object's [[Class]] is unresolvable (Firefox < 4, IE < 9) */
  var noArgsClass = !isArguments(arguments);

  /** Detect if `Array#slice` cannot be used to convert strings to arrays (Opera < 10.52) */
  var noArraySliceOnStrings = slice.call('x')[0] != 'x';

  /**
   * Detect lack of support for accessing string characters by index:
   *
   * IE < 8 can't access characters by index and IE 8 can only access
   * characters by index on string literals.
   */
  var noCharByIndex = ('x'[0] + Object('x')[0]) != 'xx';

  /**
   * Detect if a node's [[Class]] is unresolvable (IE < 9)
   * and that the JS engine won't error when attempting to coerce an object to
   * a string without a `toString` property value of `typeof` "function".
   */
  try {
    var noNodeClass = ({ 'toString': 0 } + '', toString.call(window.document || 0) == objectClass);
  } catch(e) { }

  /* Detect if `Function#bind` exists and is inferred to be fast (all but V8) */
  var isBindFast = nativeBind && /\n|Opera/.test(nativeBind + toString.call(window.opera));

  /* Detect if `Object.keys` exists and is inferred to be fast (IE, Opera, V8) */
  var isKeysFast = nativeKeys && /^.+$|true/.test(nativeKeys + !!window.attachEvent);

  /**
   * Detect if sourceURL syntax is usable without erroring:
   *
   * The JS engine in Adobe products, like InDesign, will throw a syntax error
   * when it encounters a single line comment beginning with the `@` symbol.
   *
   * The JS engine in Narwhal will generate the function `function anonymous(){//}`
   * and throw a syntax error.
   *
   * Avoid comments beginning `@` symbols in IE because they are part of its
   * non-standard conditional compilation support.
   * http://msdn.microsoft.com/en-us/library/121hztk3(v=vs.94).aspx
   */
  try {
    var useSourceURL = (Function('//@')(), !window.attachEvent);
  } catch(e) { }

  /** Used to identify object classifications that `_.clone` supports */
  var cloneableClasses = {};
  cloneableClasses[argsClass] = cloneableClasses[funcClass] = false;
  cloneableClasses[arrayClass] = cloneableClasses[boolClass] = cloneableClasses[dateClass] =
  cloneableClasses[numberClass] = cloneableClasses[objectClass] = cloneableClasses[regexpClass] =
  cloneableClasses[stringClass] = true;

  /** Used to determine if values are of the language type Object */
  var objectTypes = {
    'boolean': false,
    'function': true,
    'object': true,
    'number': false,
    'string': false,
    'undefined': false
  };

  /** Used to escape characters for inclusion in compiled string literals */
  var stringEscapes = {
    '\\': '\\',
    "'": "'",
    '\n': 'n',
    '\r': 'r',
    '\t': 't',
    '\u2028': 'u2028',
    '\u2029': 'u2029'
  };

  /*--------------------------------------------------------------------------*/

  /**
   * The `lodash` function.
   *
   * @name _
   * @constructor
   * @category Chaining
   * @param {Mixed} value The value to wrap in a `lodash` instance.
   * @returns {Object} Returns a `lodash` instance.
   */
  function lodash(value) {
    // exit early if already wrapped
    if (value && value.__wrapped__) {
      return value;
    }
    // allow invoking `lodash` without the `new` operator
    if (!(this instanceof lodash)) {
      return new lodash(value);
    }
    this.__wrapped__ = value;
  }

  /**
   * By default, the template delimiters used by Lo-Dash are similar to those in
   * embedded Ruby (ERB). Change the following template settings to use alternative
   * delimiters.
   *
   * @static
   * @memberOf _
   * @type Object
   */
  lodash.templateSettings = {

    /**
     * Used to detect `data` property values to be HTML-escaped.
     *
     * @static
     * @memberOf _.templateSettings
     * @type RegExp
     */
    'escape': /<%-([\s\S]+?)%>/g,

    /**
     * Used to detect code to be evaluated.
     *
     * @static
     * @memberOf _.templateSettings
     * @type RegExp
     */
    'evaluate': /<%([\s\S]+?)%>/g,

    /**
     * Used to detect `data` property values to inject.
     *
     * @static
     * @memberOf _.templateSettings
     * @type RegExp
     */
    'interpolate': reInterpolate,

    /**
     * Used to reference the data object in the template text.
     *
     * @static
     * @memberOf _.templateSettings
     * @type String
     */
    'variable': ''
  };

  /*--------------------------------------------------------------------------*/

  /**
   * The template used to create iterator functions.
   *
   * @private
   * @param {Obect} data The data object used to populate the text.
   * @returns {String} Returns the interpolated text.
   */
  var iteratorTemplate = template(
    // conditional strict mode
    '<% if (obj.useStrict) { %>\'use strict\';\n<% } %>' +

    // the `iteratee` may be reassigned by the `top` snippet
    'var index, value, iteratee = <%= firstArg %>, ' +
    // assign the `result` variable an initial value
    'result = <%= firstArg %>;\n' +
    // exit early if the first argument is falsey
    'if (!<%= firstArg %>) return result;\n' +
    // add code before the iteration branches
    '<%= top %>;\n' +

    // array-like iteration:
    '<% if (arrayLoop) { %>' +
    'var length = iteratee.length; index = -1;\n' +
    'if (typeof length == \'number\') {' +

    // add support for accessing string characters by index if needed
    '  <% if (noCharByIndex) { %>\n' +
    '  if (isString(iteratee)) {\n' +
    '    iteratee = iteratee.split(\'\')\n' +
    '  }' +
    '  <% } %>\n' +

    // iterate over the array-like value
    '  while (++index < length) {\n' +
    '    value = iteratee[index];\n' +
    '    <%= arrayLoop %>\n' +
    '  }\n' +
    '}\n' +
    'else {' +

    // object iteration:
    // add support for iterating over `arguments` objects if needed
    '  <%  } else if (noArgsEnum) { %>\n' +
    '  var length = iteratee.length; index = -1;\n' +
    '  if (length && isArguments(iteratee)) {\n' +
    '    while (++index < length) {\n' +
    '      value = iteratee[index += \'\'];\n' +
    '      <%= objectLoop %>\n' +
    '    }\n' +
    '  } else {' +
    '  <% } %>' +

    // Firefox < 3.6, Opera > 9.50 - Opera < 11.60, and Safari < 5.1
    // (if the prototype or a property on the prototype has been set)
    // incorrectly sets a function's `prototype` property [[Enumerable]]
    // value to `true`. Because of this Lo-Dash standardizes on skipping
    // the the `prototype` property of functions regardless of its
    // [[Enumerable]] value.
    '  <% if (!hasDontEnumBug) { %>\n' +
    '  var skipProto = typeof iteratee == \'function\' && \n' +
    '    propertyIsEnumerable.call(iteratee, \'prototype\');\n' +
    '  <% } %>' +

    // iterate own properties using `Object.keys` if it's fast
    '  <% if (isKeysFast && useHas) { %>\n' +
    '  var ownIndex = -1,\n' +
    '      ownProps = objectTypes[typeof iteratee] ? nativeKeys(iteratee) : [],\n' +
    '      length = ownProps.length;\n\n' +
    '  while (++ownIndex < length) {\n' +
    '    index = ownProps[ownIndex];\n' +
    '    <% if (!hasDontEnumBug) { %>if (!(skipProto && index == \'prototype\')) {\n  <% } %>' +
    '    value = iteratee[index];\n' +
    '    <%= objectLoop %>\n' +
    '    <% if (!hasDontEnumBug) { %>}\n<% } %>' +
    '  }' +

    // else using a for-in loop
    '  <% } else { %>\n' +
    '  for (index in iteratee) {<%' +
    '    if (!hasDontEnumBug || useHas) { %>\n    if (<%' +
    '      if (!hasDontEnumBug) { %>!(skipProto && index == \'prototype\')<% }' +
    '      if (!hasDontEnumBug && useHas) { %> && <% }' +
    '      if (useHas) { %>hasOwnProperty.call(iteratee, index)<% }' +
    '    %>) {' +
    '    <% } %>\n' +
    '    value = iteratee[index];\n' +
    '    <%= objectLoop %>;' +
    '    <% if (!hasDontEnumBug || useHas) { %>\n    }<% } %>\n' +
    '  }' +
    '  <% } %>' +

    // Because IE < 9 can't set the `[[Enumerable]]` attribute of an
    // existing property and the `constructor` property of a prototype
    // defaults to non-enumerable, Lo-Dash skips the `constructor`
    // property when it infers it's iterating over a `prototype` object.
    '  <% if (hasDontEnumBug) { %>\n\n' +
    '  var ctor = iteratee.constructor;\n' +
    '    <% for (var k = 0; k < 7; k++) { %>\n' +
    '  index = \'<%= shadowed[k] %>\';\n' +
    '  if (<%' +
    '      if (shadowed[k] == \'constructor\') {' +
    '        %>!(ctor && ctor.prototype === iteratee) && <%' +
    '      } %>hasOwnProperty.call(iteratee, index)) {\n' +
    '    value = iteratee[index];\n' +
    '    <%= objectLoop %>\n' +
    '  }' +
    '    <% } %>' +
    '  <% } %>' +
    '  <% if (arrayLoop || noArgsEnum) { %>\n}<% } %>\n' +

    // add code to the bottom of the iteration function
    '<%= bottom %>;\n' +
    // finally, return the `result`
    'return result'
  );

  /** Reusable iterator options for `assign` and `defaults` */
  var assignIteratorOptions = {
    'args': 'object, source, guard',
    'top':
      'for (var argsIndex = 1, argsLength = typeof guard == \'number\' ? 2 : arguments.length; argsIndex < argsLength; argsIndex++) {\n' +
      '  if ((iteratee = arguments[argsIndex])) {',
    'objectLoop': 'result[index] = value',
    'bottom': '  }\n}'
  };

  /**
   * Reusable iterator options shared by `forEach`, `forIn`, and `forOwn`.
   */
  var forEachIteratorOptions = {
    'args': 'collection, callback, thisArg',
    'top': 'callback = createCallback(callback, thisArg)',
    'arrayLoop': 'if (callback(value, index, collection) === false) return result',
    'objectLoop': 'if (callback(value, index, collection) === false) return result'
  };

  /** Reusable iterator options for `forIn` and `forOwn` */
  var forOwnIteratorOptions = {
    'arrayLoop': null
  };

  /*--------------------------------------------------------------------------*/

  /**
   * Creates a function optimized to search large arrays for a given `value`,
   * starting at `fromIndex`, using strict equality for comparisons, i.e. `===`.
   *
   * @private
   * @param {Array} array The array to search.
   * @param {Mixed} value The value to search for.
   * @param {Number} [fromIndex=0] The index to search from.
   * @param {Number} [largeSize=30] The length at which an array is considered large.
   * @returns {Boolean} Returns `true` if `value` is found, else `false`.
   */
  function cachedContains(array, fromIndex, largeSize) {
    fromIndex || (fromIndex = 0);

    var length = array.length,
        isLarge = (length - fromIndex) >= (largeSize || largeArraySize);

    if (isLarge) {
      var cache = {},
          index = fromIndex - 1;

      while (++index < length) {
        // manually coerce `value` to a string because `hasOwnProperty`, in some
        // older versions of Firefox, coerces objects incorrectly
        var key = array[index] + '';
        (hasOwnProperty.call(cache, key) ? cache[key] : (cache[key] = [])).push(array[index]);
      }
    }
    return function(value) {
      if (isLarge) {
        var key = value + '';
        return hasOwnProperty.call(cache, key) && indexOf(cache[key], value) > -1;
      }
      return indexOf(array, value, fromIndex) > -1;
    }
  }

  /**
   * Used by `_.max` and `_.min` as the default `callback` when a given
   * `collection` is a string value.
   *
   * @private
   * @param {String} value The character to inspect.
   * @returns {Number} Returns the code unit of given character.
   */
  function charAtCallback(value) {
    return value.charCodeAt(0);
  }

  /**
   * Used by `sortBy` to compare transformed `collection` values, stable sorting
   * them in ascending order.
   *
   * @private
   * @param {Object} a The object to compare to `b`.
   * @param {Object} b The object to compare to `a`.
   * @returns {Number} Returns the sort order indicator of `1` or `-1`.
   */
  function compareAscending(a, b) {
    var ai = a.index,
        bi = b.index;

    a = a.criteria;
    b = b.criteria;

    // ensure a stable sort in V8 and other engines
    // http://code.google.com/p/v8/issues/detail?id=90
    if (a !== b) {
      if (a > b || a === undefined) {
        return 1;
      }
      if (a < b || b === undefined) {
        return -1;
      }
    }
    return ai < bi ? -1 : 1;
  }

  /**
   * Creates a function that, when called, invokes `func` with the `this`
   * binding of `thisArg` and prepends any `partailArgs` to the arguments passed
   * to the bound function.
   *
   * @private
   * @param {Function|String} func The function to bind or the method name.
   * @param {Mixed} [thisArg] The `this` binding of `func`.
   * @param {Array} partialArgs An array of arguments to be partially applied.
   * @returns {Function} Returns the new bound function.
   */
  function createBound(func, thisArg, partialArgs) {
    var isFunc = isFunction(func),
        isPartial = !partialArgs,
        key = thisArg;

    // juggle arguments
    if (isPartial) {
      partialArgs = thisArg;
    }
    if (!isFunc) {
      thisArg = func;
    }

    function bound() {
      // `Function#bind` spec
      // http://es5.github.com/#x15.3.4.5
      var args = arguments,
          thisBinding = isPartial ? this : thisArg;

      if (!isFunc) {
        func = thisArg[key];
      }
      if (partialArgs.length) {
        args = args.length
          ? partialArgs.concat(slice.call(args))
          : partialArgs;
      }
      if (this instanceof bound) {
        // get `func` instance if `bound` is invoked in a `new` expression
        noop.prototype = func.prototype;
        thisBinding = new noop;

        // mimic the constructor's `return` behavior
        // http://es5.github.com/#x13.2.2
        var result = func.apply(thisBinding, args);
        return isObject(result)
          ? result
          : thisBinding
      }
      return func.apply(thisBinding, args);
    }
    return bound;
  }

  /**
   * Produces an iteration callback bound to an optional `thisArg`. If `func` is
   * a property name, the callback will return the property value for a given element.
   *
   * @private
   * @param {Function|String} [func=identity|property] The function called per
   * iteration or property name to query.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Function} Returns a callback function.
   */
  function createCallback(func, thisArg) {
    if (!func) {
      return identity;
    }
    if (typeof func != 'function') {
      return function(object) {
        return object[func];
      };
    }
    if (thisArg !== undefined) {
      return function(value, index, object) {
        return func.call(thisArg, value, index, object);
      };
    }
    return func;
  }

  /**
   * Creates compiled iteration functions.
   *
   * @private
   * @param {Object} [options1, options2, ...] The compile options object(s).
   *  useHas - A boolean to specify using `hasOwnProperty` checks in the object loop.
   *  args - A string of comma separated arguments the iteration function will accept.
   *  top - A string of code to execute before the iteration branches.
   *  arrayLoop - A string of code to execute in the array loop.
   *  objectLoop - A string of code to execute in the object loop.
   *  bottom - A string of code to execute after the iteration branches.
   *
   * @returns {Function} Returns the compiled function.
   */
  function createIterator() {
    var data = {
      'arrayLoop': '',
      'bottom': '',
      'hasDontEnumBug': hasDontEnumBug,
      'isKeysFast': isKeysFast,
      'objectLoop': '',
      'noArgsEnum': noArgsEnum,
      'noCharByIndex': noCharByIndex,
      'shadowed': shadowed,
      'top': '',
      'useHas': true
    };

    // merge options into a template data object
    for (var object, index = 0; object = arguments[index]; index++) {
      for (var key in object) {
        data[key] = object[key];
      }
    }
    var args = data.args;
    data.firstArg = /^[^,]+/.exec(args)[0];

    // create the function factory
    var factory = Function(
        'createCallback, hasOwnProperty, isArguments, isString, objectTypes, ' +
        'nativeKeys, propertyIsEnumerable',
      'return function(' + args + ') {\n' + iteratorTemplate(data) + '\n}'
    );
    // return the compiled function
    return factory(
      createCallback, hasOwnProperty, isArguments, isString, objectTypes,
      nativeKeys, propertyIsEnumerable
    );
  }

  /**
   * Used by `template` to escape characters for inclusion in compiled
   * string literals.
   *
   * @private
   * @param {String} match The matched character to escape.
   * @returns {String} Returns the escaped character.
   */
  function escapeStringChar(match) {
    return '\\' + stringEscapes[match];
  }

  /**
   * Used by `escape` to convert characters to HTML entities.
   *
   * @private
   * @param {String} match The matched character to escape.
   * @returns {String} Returns the escaped character.
   */
  function escapeHtmlChar(match) {
    return htmlEscapes[match];
  }

  /**
   * A no-operation function.
   *
   * @private
   */
  function noop() {
    // no operation performed
  }

  /**
   * Used by `unescape` to convert HTML entities to characters.
   *
   * @private
   * @param {String} match The matched character to unescape.
   * @returns {String} Returns the unescaped character.
   */
  function unescapeHtmlChar(match) {
    return htmlUnescapes[match];
  }

  /*--------------------------------------------------------------------------*/

  /**
   * Assigns own enumerable properties of source object(s) to the `destination`
   * object. Subsequent sources will overwrite propery assignments of previous
   * sources.
   *
   * @static
   * @memberOf _
   * @alias extend
   * @category Objects
   * @param {Object} object The destination object.
   * @param {Object} [source1, source2, ...] The source objects.
   * @returns {Object} Returns the destination object.
   * @example
   *
   * _.assign({ 'name': 'moe' }, { 'age': 40 });
   * // => { 'name': 'moe', 'age': 40 }
   */
  var assign = createIterator(assignIteratorOptions);

  /**
   * Checks if `value` is an `arguments` object.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is an `arguments` object, else `false`.
   * @example
   *
   * (function() { return _.isArguments(arguments); })(1, 2, 3);
   * // => true
   *
   * _.isArguments([1, 2, 3]);
   * // => false
   */
  function isArguments(value) {
    return toString.call(value) == argsClass;
  }
  // fallback for browsers that can't detect `arguments` objects by [[Class]]
  if (noArgsClass) {
    isArguments = function(value) {
      return value ? hasOwnProperty.call(value, 'callee') : false;
    };
  }

  /**
   * Iterates over `object`'s own and inherited enumerable properties, executing
   * the `callback` for each property. The `callback` is bound to `thisArg` and
   * invoked with three arguments; (value, key, object). Callbacks may exit iteration
   * early by explicitly returning `false`.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Object} object The object to iterate over.
   * @param {Function} callback The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Object} Returns `object`.
   * @example
   *
   * function Dog(name) {
   *   this.name = name;
   * }
   *
   * Dog.prototype.bark = function() {
   *   alert('Woof, woof!');
   * };
   *
   * _.forIn(new Dog('Dagny'), function(value, key) {
   *   alert(key);
   * });
   * // => alerts 'name' and 'bark' (order is not guaranteed)
   */
  var forIn = createIterator(forEachIteratorOptions, forOwnIteratorOptions, {
    'useHas': false
  });

  /**
   * Iterates over an object's own enumerable properties, executing the `callback`
   * for each property. The `callback` is bound to `thisArg` and invoked with three
   * arguments; (value, key, object). Callbacks may exit iteration early by explicitly
   * returning `false`.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Object} object The object to iterate over.
   * @param {Function} callback The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Object} Returns `object`.
   * @example
   *
   * _.forOwn({ '0': 'zero', '1': 'one', 'length': 2 }, function(num, key) {
   *   alert(key);
   * });
   * // => alerts '0', '1', and 'length' (order is not guaranteed)
   */
  var forOwn = createIterator(forEachIteratorOptions, forOwnIteratorOptions);

  /**
   * A fallback implementation of `isPlainObject` that checks if a given `value`
   * is an object created by the `Object` constructor, assuming objects created
   * by the `Object` constructor have no inherited enumerable properties and that
   * there are no `Object.prototype` extensions.
   *
   * @private
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if `value` is a plain object, else `false`.
   */
  function shimIsPlainObject(value) {
    // avoid non-objects and false positives for `arguments` objects
    var result = false;
    if (!(value && typeof value == 'object') || isArguments(value)) {
      return result;
    }
    // IE < 9 presents DOM nodes as `Object` objects except they have `toString`
    // methods that are `typeof` "string" and still can coerce nodes to strings.
    // Also check that the constructor is `Object` (i.e. `Object instanceof Object`)
    var ctor = value.constructor;
    if ((!noNodeClass || !(typeof value.toString != 'function' && typeof (value + '') == 'string')) &&
        (!isFunction(ctor) || ctor instanceof ctor)) {
      // IE < 9 iterates inherited properties before own properties. If the first
      // iterated property is an object's own property then there are no inherited
      // enumerable properties.
      if (iteratesOwnLast) {
        forIn(value, function(value, key, object) {
          result = !hasOwnProperty.call(object, key);
          return false;
        });
        return result === false;
      }
      // In most environments an object's own properties are iterated before
      // its inherited properties. If the last iterated property is an object's
      // own property then there are no inherited enumerable properties.
      forIn(value, function(value, key) {
        result = key;
      });
      return result === false || hasOwnProperty.call(value, result);
    }
    return result;
  }

  /**
   * A fallback implementation of `Object.keys` that produces an array of the
   * given object's own enumerable property names.
   *
   * @private
   * @param {Object} object The object to inspect.
   * @returns {Array} Returns a new array of property names.
   */
  function shimKeys(object) {
    var result = [];
    forOwn(object, function(value, key) {
      result.push(key);
    });
    return result;
  }

  /**
   * Used to convert characters to HTML entities:
   *
   * Though the `>` character is escaped for symmetry, characters like `>` and `/`
   * don't require escaping in HTML and have no special meaning unless they're part
   * of a tag or an unquoted attribute value.
   * http://mathiasbynens.be/notes/ambiguous-ampersands (under "semi-related fun fact")
   */
  var htmlEscapes = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;'
  };

  /** Used to convert HTML entities to characters */
  var htmlUnescapes = invert(htmlEscapes);

  /*--------------------------------------------------------------------------*/

  /**
   * Creates a clone of `value`. If `deep` is `true`, all nested objects will
   * also be cloned otherwise they will be assigned by reference. Functions, DOM
   * nodes, `arguments` objects, and objects created by constructors other than
   * `Object` are **not** cloned.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to clone.
   * @param {Boolean} deep A flag to indicate a deep clone.
   * @param- {Object} [guard] Internally used to allow this method to work with
   *  others like `_.map` without using their callback `index` argument for `deep`.
   * @param- {Array} [stackA=[]] Internally used to track traversed source objects.
   * @param- {Array} [stackB=[]] Internally used to associate clones with their
   *  source counterparts.
   * @returns {Mixed} Returns the cloned `value`.
   * @example
   *
   * var stooges = [
   *   { 'name': 'moe', 'age': 40 },
   *   { 'name': 'larry', 'age': 50 },
   *   { 'name': 'curly', 'age': 60 }
   * ];
   *
   * _.clone({ 'name': 'moe' });
   * // => { 'name': 'moe' }
   *
   * var shallow = _.clone(stooges);
   * shallow[0] === stooges[0];
   * // => true
   *
   * var deep = _.clone(stooges, true);
   * shallow[0] === stooges[0];
   * // => false
   */
  function clone(value, deep, guard, stackA, stackB) {
    if (value == null) {
      return value;
    }
    if (guard) {
      deep = false;
    }
    // inspect [[Class]]
    var isObj = isObject(value);
    if (isObj) {
      // don't clone `arguments` objects, functions, or non-object Objects
      var className = toString.call(value);
      if (!cloneableClasses[className] || (noArgsClass && isArguments(value))) {
        return value;
      }
      var isArr = className == arrayClass;
      isObj = isArr || (className == objectClass ? isPlainObject(value) : isObj);
    }
    // shallow clone
    if (!isObj || !deep) {
      // don't clone functions
      return isObj
        ? (isArr ? slice.call(value) : assign({}, value))
        : value;
    }

    var ctor = value.constructor;
    switch (className) {
      case boolClass:
      case dateClass:
        return new ctor(+value);

      case numberClass:
      case stringClass:
        return new ctor(value);

      case regexpClass:
        return ctor(value.source, reFlags.exec(value));
    }
    // check for circular references and return corresponding clone
    stackA || (stackA = []);
    stackB || (stackB = []);

    var length = stackA.length;
    while (length--) {
      if (stackA[length] == value) {
        return stackB[length];
      }
    }
    // init cloned object
    var result = isArr ? ctor(value.length) : {};

    // add the source value to the stack of traversed objects
    // and associate it with its clone
    stackA.push(value);
    stackB.push(result);

    // recursively populate clone (susceptible to call stack limits)
    (isArr ? forEach : forOwn)(value, function(objValue, key) {
      result[key] = clone(objValue, deep, null, stackA, stackB);
    });

    return result;
  }

  /**
   * Assigns own enumerable properties of source object(s) to the `destination`
   * object for all `destination` properties that resolve to `null`/`undefined`.
   * Once a property is set, additional defaults of the same property will be
   * ignored.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Object} object The destination object.
   * @param {Object} [default1, default2, ...] The default objects.
   * @returns {Object} Returns the destination object.
   * @example
   *
   * var iceCream = { 'flavor': 'chocolate' };
   * _.defaults(iceCream, { 'flavor': 'vanilla', 'sprinkles': 'rainbow' });
   * // => { 'flavor': 'chocolate', 'sprinkles': 'rainbow' }
   */
  var defaults = createIterator(assignIteratorOptions, {
    'objectLoop': 'if (result[index] == null) ' + assignIteratorOptions.objectLoop
  });

  /**
   * Creates a sorted array of all enumerable properties, own and inherited,
   * of `object` that have function values.
   *
   * @static
   * @memberOf _
   * @alias methods
   * @category Objects
   * @param {Object} object The object to inspect.
   * @returns {Array} Returns a new array of property names that have function values.
   * @example
   *
   * _.functions(_);
   * // => ['all', 'any', 'bind', 'bindAll', 'clone', 'compact', 'compose', ...]
   */
  function functions(object) {
    var result = [];
    forIn(object, function(value, key) {
      if (isFunction(value)) {
        result.push(key);
      }
    });
    return result.sort();
  }

  /**
   * Checks if the specified object `property` exists and is a direct property,
   * instead of an inherited property.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Object} object The object to check.
   * @param {String} property The property to check for.
   * @returns {Boolean} Returns `true` if key is a direct property, else `false`.
   * @example
   *
   * _.has({ 'a': 1, 'b': 2, 'c': 3 }, 'b');
   * // => true
   */
  function has(object, property) {
    return object ? hasOwnProperty.call(object, property) : false;
  }

  /**
   * Creates an object composed of the inverted keys and values of the given `object`.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Object} object The object to invert.
   * @returns {Object} Returns the created inverted object.
   * @example
   *
   *  _.invert({ 'first': 'Moe', 'second': 'Larry', 'third': 'Curly' });
   * // => { 'Moe': 'first', 'Larry': 'second', 'Curly': 'third' } (order is not guaranteed)
   */
  function invert(object) {
    var result = {};
    forOwn(object, function(value, key) {
      result[value] = key;
    });
    return result;
  }

  /**
   * Checks if `value` is an array.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is an array, else `false`.
   * @example
   *
   * (function() { return _.isArray(arguments); })();
   * // => false
   *
   * _.isArray([1, 2, 3]);
   * // => true
   */
  var isArray = nativeIsArray || function(value) {
    return toString.call(value) == arrayClass;
  };

  /**
   * Checks if `value` is a boolean (`true` or `false`) value.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is a boolean value, else `false`.
   * @example
   *
   * _.isBoolean(null);
   * // => false
   */
  function isBoolean(value) {
    return value === true || value === false || toString.call(value) == boolClass;
  }

  /**
   * Checks if `value` is a date.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is a date, else `false`.
   * @example
   *
   * _.isDate(new Date);
   * // => true
   */
  function isDate(value) {
    return toString.call(value) == dateClass;
  }

  /**
   * Checks if `value` is a DOM element.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is a DOM element, else `false`.
   * @example
   *
   * _.isElement(document.body);
   * // => true
   */
  function isElement(value) {
    return value ? value.nodeType === 1 : false;
  }

  /**
   * Checks if `value` is empty. Arrays, strings, or `arguments` objects with a
   * length of `0` and objects with no own enumerable properties are considered
   * "empty".
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Array|Object|String} value The value to inspect.
   * @returns {Boolean} Returns `true` if the `value` is empty, else `false`.
   * @example
   *
   * _.isEmpty([1, 2, 3]);
   * // => false
   *
   * _.isEmpty({});
   * // => true
   *
   * _.isEmpty('');
   * // => true
   */
  function isEmpty(value) {
    var result = true;
    if (!value) {
      return result;
    }
    var className = toString.call(value),
        length = value.length;

    if ((className == arrayClass || className == stringClass ||
        className == argsClass || (noArgsClass && isArguments(value))) ||
        (className == objectClass && typeof length == 'number' && isFunction(value.splice))) {
      return !length;
    }
    forOwn(value, function() {
      return (result = false);
    });
    return result;
  }

  /**
   * Performs a deep comparison between two values to determine if they are
   * equivalent to each other.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} a The value to compare.
   * @param {Mixed} b The other value to compare.
   * @param- {Object} [stackA=[]] Internally used track traversed `a` objects.
   * @param- {Object} [stackB=[]] Internally used track traversed `b` objects.
   * @returns {Boolean} Returns `true` if the values are equvalent, else `false`.
   * @example
   *
   * var moe = { 'name': 'moe', 'luckyNumbers': [13, 27, 34] };
   * var clone = { 'name': 'moe', 'luckyNumbers': [13, 27, 34] };
   *
   * moe == clone;
   * // => false
   *
   * _.isEqual(moe, clone);
   * // => true
   */
  function isEqual(a, b, stackA, stackB) {
    // exit early for identical values
    if (a === b) {
      // treat `+0` vs. `-0` as not equal
      return a !== 0 || (1 / a == 1 / b);
    }
    // a strict comparison is necessary because `null == undefined`
    if (a == null || b == null) {
      return a === b;
    }
    // compare [[Class]] names
    var className = toString.call(a);
    if (className != toString.call(b)) {
      return false;
    }
    switch (className) {
      case boolClass:
      case dateClass:
        // coerce dates and booleans to numbers, dates to milliseconds and booleans
        // to `1` or `0`, treating invalid dates coerced to `NaN` as not equal
        return +a == +b;

      case numberClass:
        // treat `NaN` vs. `NaN` as equal
        return a != +a
          ? b != +b
          // but treat `+0` vs. `-0` as not equal
          : (a == 0 ? (1 / a == 1 / b) : a == +b);

      case regexpClass:
      case stringClass:
        // coerce regexes to strings (http://es5.github.com/#x15.10.6.4)
        // treat string primitives and their corresponding object instances as equal
        return a == b + '';
    }
    // exit early, in older browsers, if `a` is array-like but not `b`
    var isArr = className == arrayClass || className == argsClass;
    if (noArgsClass && !isArr && (isArr = isArguments(a)) && !isArguments(b)) {
      return false;
    }
    if (!isArr) {
      // unwrap any `lodash` wrapped values
      if (a.__wrapped__ || b.__wrapped__) {
        return isEqual(a.__wrapped__ || a, b.__wrapped__ || b);
      }
      // exit for functions and DOM nodes
      if (className != objectClass || (noNodeClass && (
          (typeof a.toString != 'function' && typeof (a + '') == 'string') ||
          (typeof b.toString != 'function' && typeof (b + '') == 'string')))) {
        return false;
      }
      var ctorA = a.constructor,
          ctorB = b.constructor;

      // non `Object` object instances with different constructors are not equal
      if (ctorA != ctorB && !(
            isFunction(ctorA) && ctorA instanceof ctorA &&
            isFunction(ctorB) && ctorB instanceof ctorB
          )) {
        return false;
      }
    }
    // assume cyclic structures are equal
    // the algorithm for detecting cyclic structures is adapted from ES 5.1
    // section 15.12.3, abstract operation `JO` (http://es5.github.com/#x15.12.3)
    stackA || (stackA = []);
    stackB || (stackB = []);

    var length = stackA.length;
    while (length--) {
      if (stackA[length] == a) {
        return stackB[length] == b;
      }
    }

    var index = -1,
        result = true,
        size = 0;

    // add `a` and `b` to the stack of traversed objects
    stackA.push(a);
    stackB.push(b);

    // recursively compare objects and arrays (susceptible to call stack limits)
    if (isArr) {
      // compare lengths to determine if a deep comparison is necessary
      size = a.length;
      result = size == b.length;

      if (result) {
        // deep compare the contents, ignoring non-numeric properties
        while (size--) {
          if (!(result = isEqual(a[size], b[size], stackA, stackB))) {
            break;
          }
        }
      }
      return result;
    }
    // deep compare objects
    for (var key in a) {
      if (hasOwnProperty.call(a, key)) {
        // count the number of properties.
        size++;
        // deep compare each property value.
        if (!(hasOwnProperty.call(b, key) && isEqual(a[key], b[key], stackA, stackB))) {
          return false;
        }
      }
    }
    // ensure both objects have the same number of properties
    for (key in b) {
      // The JS engine in Adobe products, like InDesign, has a bug that causes
      // `!size--` to throw an error so it must be wrapped in parentheses.
      // https://github.com/documentcloud/underscore/issues/355
      if (hasOwnProperty.call(b, key) && !(size--)) {
        // `size` will be `-1` if `b` has more properties than `a`
        return false;
      }
    }
    // handle JScript [[DontEnum]] bug
    if (hasDontEnumBug) {
      while (++index < 7) {
        key = shadowed[index];
        if (hasOwnProperty.call(a, key) &&
            !(hasOwnProperty.call(b, key) && isEqual(a[key], b[key], stackA, stackB))) {
          return false;
        }
      }
    }
    return true;
  }

  /**
   * Checks if `value` is, or can be coerced to, a finite number.
   *
   * Note: This is not the same as native `isFinite`, which will return true for
   * booleans and empty strings. See http://es5.github.com/#x15.1.2.5.
   *
   * @deprecated
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is a finite number, else `false`.
   * @example
   *
   * _.isFinite(-101);
   * // => true
   *
   * _.isFinite('10');
   * // => true
   *
   * _.isFinite(true);
   * // => false
   *
   * _.isFinite('');
   * // => false
   *
   * _.isFinite(Infinity);
   * // => false
   */
  function isFinite(value) {
    return nativeIsFinite(value) && !nativeIsNaN(parseFloat(value));
  }

  /**
   * Checks if `value` is a function.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is a function, else `false`.
   * @example
   *
   * _.isFunction(_);
   * // => true
   */
  function isFunction(value) {
    return typeof value == 'function';
  }
  // fallback for older versions of Chrome and Safari
  if (isFunction(/x/)) {
    isFunction = function(value) {
      return toString.call(value) == funcClass;
    };
  }

  /**
   * Checks if `value` is the language type of Object.
   * (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is an object, else `false`.
   * @example
   *
   * _.isObject({});
   * // => true
   *
   * _.isObject([1, 2, 3]);
   * // => true
   *
   * _.isObject(1);
   * // => false
   */
  function isObject(value) {
    // check if the value is the ECMAScript language type of Object
    // http://es5.github.com/#x8
    // and avoid a V8 bug
    // http://code.google.com/p/v8/issues/detail?id=2291
    return value ? objectTypes[typeof value] : false;
  }

  /**
   * Checks if `value` is `NaN`.
   *
   * Note: This is not the same as native `isNaN`, which will return true for
   * `undefined` and other values. See http://es5.github.com/#x15.1.2.4.
   *
   * @deprecated
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is `NaN`, else `false`.
   * @example
   *
   * _.isNaN(NaN);
   * // => true
   *
   * _.isNaN(new Number(NaN));
   * // => true
   *
   * isNaN(undefined);
   * // => true
   *
   * _.isNaN(undefined);
   * // => false
   */
  function isNaN(value) {
    // `NaN` as a primitive is the only value that is not equal to itself
    // (perform the [[Class]] check first to avoid errors with some host objects in IE)
    return toString.call(value) == numberClass && value != +value
  }

  /**
   * Checks if `value` is `null`.
   *
   * @deprecated
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is `null`, else `false`.
   * @example
   *
   * _.isNull(null);
   * // => true
   *
   * _.isNull(undefined);
   * // => false
   */
  function isNull(value) {
    return value === null;
  }

  /**
   * Checks if `value` is a number.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is a number, else `false`.
   * @example
   *
   * _.isNumber(8.4 * 5);
   * // => true
   */
  function isNumber(value) {
    return toString.call(value) == numberClass;
  }

  /**
   * Checks if a given `value` is an object created by the `Object` constructor.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if `value` is a plain object, else `false`.
   * @example
   *
   * function Stooge(name, age) {
   *   this.name = name;
   *   this.age = age;
   * }
   *
   * _.isPlainObject(new Stooge('moe', 40));
   * // => false
   *
   * _.isPlainObject([1, 2, 3]);
   * // => false
   *
   * _.isPlainObject({ 'name': 'moe', 'age': 40 });
   * // => true
   */
  var isPlainObject = !getPrototypeOf ? shimIsPlainObject : function(value) {
    if (!(value && typeof value == 'object')) {
      return false;
    }
    var valueOf = value.valueOf,
        objProto = typeof valueOf == 'function' && (objProto = getPrototypeOf(valueOf)) && getPrototypeOf(objProto);

    return objProto
      ? value == objProto || (getPrototypeOf(value) == objProto && !isArguments(value))
      : shimIsPlainObject(value);
  };

  /**
   * Checks if `value` is a regular expression.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is a regular expression, else `false`.
   * @example
   *
   * _.isRegExp(/moe/);
   * // => true
   */
  function isRegExp(value) {
    return toString.call(value) == regexpClass;
  }

  /**
   * Checks if `value` is a string.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is a string, else `false`.
   * @example
   *
   * _.isString('moe');
   * // => true
   */
  function isString(value) {
    return toString.call(value) == stringClass;
  }

  /**
   * Checks if `value` is `undefined`.
   *
   * @deprecated
   * @static
   * @memberOf _
   * @category Objects
   * @param {Mixed} value The value to check.
   * @returns {Boolean} Returns `true` if the `value` is `undefined`, else `false`.
   * @example
   *
   * _.isUndefined(void 0);
   * // => true
   */
  function isUndefined(value) {
    return value === undefined;
  }

  /**
   * Creates an array composed of the own enumerable property names of `object`.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Object} object The object to inspect.
   * @returns {Array} Returns a new array of property names.
   * @example
   *
   * _.keys({ 'one': 1, 'two': 2, 'three': 3 });
   * // => ['one', 'two', 'three'] (order is not guaranteed)
   */
  var keys = !nativeKeys ? shimKeys : function(object) {
    // avoid iterating over the `prototype` property
    return typeof object == 'function' && propertyIsEnumerable.call(object, 'prototype')
      ? shimKeys(object)
      : (isObject(object) ? nativeKeys(object) : []);
  };

  /**
   * Merges enumerable properties of the source object(s) into the `destination`
   * object. Subsequent sources will overwrite propery assignments of previous
   * sources.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Object} object The destination object.
   * @param {Object} [source1, source2, ...] The source objects.
   * @param- {Object} [indicator] Internally used to indicate that the `stack`
   *  argument is an array of traversed objects instead of another source object.
   * @param- {Array} [stackA=[]] Internally used to track traversed source objects.
   * @param- {Array} [stackB=[]] Internally used to associate values with their
   *  source counterparts.
   * @returns {Object} Returns the destination object.
   * @example
   *
   * var stooges = [
   *   { 'name': 'moe' },
   *   { 'name': 'larry' }
   * ];
   *
   * var ages = [
   *   { 'age': 40 },
   *   { 'age': 50 }
   * ];
   *
   * _.merge(stooges, ages);
   * // => [{ 'name': 'moe', 'age': 40 }, { 'name': 'larry', 'age': 50 }]
   */
  function merge(object, source, indicator) {
    var args = arguments,
        index = 0,
        length = 2,
        stackA = args[3],
        stackB = args[4];

    if (indicator !== indicatorObject) {
      stackA = [];
      stackB = [];

      // work with `_.reduce` by only using its callback `accumulator` and `value` arguments
      if (typeof indicator != 'number') {
        length = args.length;
      }
    }
    while (++index < length) {
      forOwn(args[index], function(source, key) {
        var found, isArr, value;
        if (source && ((isArr = isArray(source)) || isPlainObject(source))) {
          // avoid merging previously merged cyclic sources
          var stackLength = stackA.length;
          while (stackLength--) {
            found = stackA[stackLength] == source;
            if (found) {
              break;
            }
          }
          if (found) {
            object[key] = stackB[stackLength];
          }
          else {
            // add `source` and associated `value` to the stack of traversed objects
            stackA.push(source);
            stackB.push(value = (value = object[key], isArr)
              ? (isArray(value) ? value : [])
              : (isPlainObject(value) ? value : {})
            );
            // recursively merge objects and arrays (susceptible to call stack limits)
            object[key] = merge(value, source, indicatorObject, stackA, stackB);
          }
        } else if (source != null) {
          object[key] = source;
        }
      });
    }
    return object;
  }

  /**
   * Creates a shallow clone of `object` excluding the specified properties.
   * Property names may be specified as individual arguments or as arrays of
   * property names. If `callback` is passed, it will be executed for each property
   * in the `object`, omitting the properties `callback` returns truthy for. The
   * `callback` is bound to `thisArg` and invoked with three arguments; (value, key, object).
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Object} object The source object.
   * @param {Function|String} callback|[prop1, prop2, ...] The properties to omit
   *  or the function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Object} Returns an object without the omitted properties.
   * @example
   *
   * _.omit({ 'name': 'moe', 'age': 40, 'userid': 'moe1' }, 'userid');
   * // => { 'name': 'moe', 'age': 40 }
   *
   * _.omit({ 'name': 'moe', '_hint': 'knucklehead', '_seed': '96c4eb' }, function(value, key) {
   *   return key.charAt(0) == '_';
   * });
   * // => { 'name': 'moe' }
   */
  function omit(object, callback, thisArg) {
    var isFunc = typeof callback == 'function',
        result = {};

    if (isFunc) {
      callback = createCallback(callback, thisArg);
    } else {
      var props = concat.apply(arrayRef, arguments);
    }
    forIn(object, function(value, key, object) {
      if (isFunc
            ? !callback(value, key, object)
            : indexOf(props, key, 1) < 0
          ) {
        result[key] = value;
      }
    });
    return result;
  }

  /**
   * Creates a two dimensional array of the given object's key-value pairs,
   * i.e. `[[key1, value1], [key2, value2]]`.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Object} object The object to inspect.
   * @returns {Array} Returns new array of key-value pairs.
   * @example
   *
   * _.pairs({ 'moe': 30, 'larry': 40, 'curly': 50 });
   * // => [['moe', 30], ['larry', 40], ['curly', 50]] (order is not guaranteed)
   */
  function pairs(object) {
    var result = [];
    forOwn(object, function(value, key) {
      result.push([key, value]);
    });
    return result;
  }

  /**
   * Creates a shallow clone of `object` composed of the specified properties.
   * Property names may be specified as individual arguments or as arrays of
   * property names. If `callback` is passed, it will be executed for each property
   * in the `object`, picking the properties `callback` returns truthy for. The
   * `callback` is bound to `thisArg` and invoked with three arguments; (value, key, object).
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Object} object The source object.
   * @param {Function|String} callback|[prop1, prop2, ...] The properties to pick
   *  or the function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Object} Returns an object composed of the picked properties.
   * @example
   *
   * _.pick({ 'name': 'moe', 'age': 40, 'userid': 'moe1' }, 'name', 'age');
   * // => { 'name': 'moe', 'age': 40 }
   *
   * _.pick({ 'name': 'moe', '_hint': 'knucklehead', '_seed': '96c4eb' }, function(value, key) {
   *   return key.charAt(0) != '_';
   * });
   * // => { 'name': 'moe' }
   */
  function pick(object, callback, thisArg) {
    var result = {};
    if (typeof callback != 'function') {
      var index = 0,
          props = concat.apply(arrayRef, arguments),
          length = props.length;

      while (++index < length) {
        var key = props[index];
        if (key in object) {
          result[key] = object[key];
        }
      }
    } else {
      callback = createCallback(callback, thisArg);
      forIn(object, function(value, key, object) {
        if (callback(value, key, object)) {
          result[key] = value;
        }
      });
    }
    return result;
  }

  /**
   * Creates an array composed of the own enumerable property values of `object`.
   *
   * @static
   * @memberOf _
   * @category Objects
   * @param {Object} object The object to inspect.
   * @returns {Array} Returns a new array of property values.
   * @example
   *
   * _.values({ 'one': 1, 'two': 2, 'three': 3 });
   * // => [1, 2, 3]
   */
  function values(object) {
    var result = [];
    forOwn(object, function(value) {
      result.push(value);
    });
    return result;
  }

  /*--------------------------------------------------------------------------*/

  /**
   * Checks if a given `target` element is present in a `collection` using strict
   * equality for comparisons, i.e. `===`. If `fromIndex` is negative, it is used
   * as the offset from the end of the collection.
   *
   * @static
   * @memberOf _
   * @alias include
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Mixed} target The value to check for.
   * @param {Number} [fromIndex=0] The index to search from.
   * @returns {Boolean} Returns `true` if the `target` element is found, else `false`.
   * @example
   *
   * _.contains([1, 2, 3], 1);
   * // => true
   *
   * _.contains([1, 2, 3], 1, 2);
   * // => false
   *
   * _.contains({ 'name': 'moe', 'age': 40 }, 'moe');
   * // => true
   *
   * _.contains('curly', 'ur');
   * // => true
   */
  function contains(collection, target, fromIndex) {
    var index = -1,
        length = collection ? collection.length : 0,
        result = false;

    fromIndex = (fromIndex < 0 ? nativeMax(0, length + fromIndex) : fromIndex) || 0;
    if (typeof length == 'number') {
      result = (isString(collection)
        ? collection.indexOf(target, fromIndex)
        : indexOf(collection, target, fromIndex)
      ) > -1;
    } else {
      forEach(collection, function(value) {
        if (++index >= fromIndex) {
          return !(result = value === target);
        }
      });
    }
    return result;
  }

  /**
   * Creates an object composed of keys returned from running each element of
   * `collection` through a `callback`. The corresponding value of each key is
   * the number of times the key was returned by `callback`. The `callback` is
   * bound to `thisArg` and invoked with three arguments; (value, index|key, collection).
   * The `callback` argument may also be the name of a property to count by (e.g. 'length').
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function|String} callback|property The function called per iteration
   *  or property name to count by.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Object} Returns the composed aggregate object.
   * @example
   *
   * _.countBy([4.3, 6.1, 6.4], function(num) { return Math.floor(num); });
   * // => { '4': 1, '6': 2 }
   *
   * _.countBy([4.3, 6.1, 6.4], function(num) { return this.floor(num); }, Math);
   * // => { '4': 1, '6': 2 }
   *
   * _.countBy(['one', 'two', 'three'], 'length');
   * // => { '3': 2, '5': 1 }
   */
  function countBy(collection, callback, thisArg) {
    var result = {};
    callback = createCallback(callback, thisArg);
    forEach(collection, function(value, key, collection) {
      key = callback(value, key, collection);
      (hasOwnProperty.call(result, key) ? result[key]++ : result[key] = 1);
    });
    return result;
  }

  /**
   * Checks if the `callback` returns a truthy value for **all** elements of a
   * `collection`. The `callback` is bound to `thisArg` and invoked with three
   * arguments; (value, index|key, collection).
   *
   * @static
   * @memberOf _
   * @alias all
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function} [callback=identity] The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Boolean} Returns `true` if all elements pass the callback check,
   *  else `false`.
   * @example
   *
   * _.every([true, 1, null, 'yes'], Boolean);
   * // => false
   */
  function every(collection, callback, thisArg) {
    var result = true;
    callback = createCallback(callback, thisArg);

    if (isArray(collection)) {
      var index = -1,
          length = collection.length;

      while (++index < length) {
        if (!(result = !!callback(collection[index], index, collection))) {
          break;
        }
      }
    } else {
      forEach(collection, function(value, index, collection) {
        return (result = !!callback(value, index, collection));
      });
    }
    return result;
  }

  /**
   * Examines each element in a `collection`, returning an array of all elements
   * the `callback` returns truthy for. The `callback` is bound to `thisArg` and
   * invoked with three arguments; (value, index|key, collection).
   *
   * @static
   * @memberOf _
   * @alias select
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function} [callback=identity] The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Array} Returns a new array of elements that passed the callback check.
   * @example
   *
   * var evens = _.filter([1, 2, 3, 4, 5, 6], function(num) { return num % 2 == 0; });
   * // => [2, 4, 6]
   */
  function filter(collection, callback, thisArg) {
    var result = [];
    callback = createCallback(callback, thisArg);

    if (isArray(collection)) {
      var index = -1,
          length = collection.length;

      while (++index < length) {
        var value = collection[index];
        if (callback(value, index, collection)) {
          result.push(value);
        }
      }
    } else {
      forEach(collection, function(value, index, collection) {
        if (callback(value, index, collection)) {
          result.push(value);
        }
      });
    }
    return result;
  }

  /**
   * Examines each element in a `collection`, returning the first one the `callback`
   * returns truthy for. The function returns as soon as it finds an acceptable
   * element, and does not iterate over the entire `collection`. The `callback` is
   * bound to `thisArg` and invoked with three arguments; (value, index|key, collection).
   *
   * @static
   * @memberOf _
   * @alias detect
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function} callback The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Mixed} Returns the element that passed the callback check,
   *  else `undefined`.
   * @example
   *
   * var even = _.find([1, 2, 3, 4, 5, 6], function(num) { return num % 2 == 0; });
   * // => 2
   */
  function find(collection, callback, thisArg) {
    var result;
    callback = createCallback(callback, thisArg);
    forEach(collection, function(value, index, collection) {
      if (callback(value, index, collection)) {
        result = value;
        return false;
      }
    });
    return result;
  }

  /**
   * Iterates over a `collection`, executing the `callback` for each element in
   * the `collection`. The `callback` is bound to `thisArg` and invoked with three
   * arguments; (value, index|key, collection). Callbacks may exit iteration early
   * by explicitly returning `false`.
   *
   * @static
   * @memberOf _
   * @alias each
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function} callback The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Array|Object|String} Returns `collection`.
   * @example
   *
   * _([1, 2, 3]).forEach(alert).join(',');
   * // => alerts each number and returns '1,2,3'
   *
   * _.forEach({ 'one': 1, 'two': 2, 'three': 3 }, alert);
   * // => alerts each number (order is not guaranteed)
   */
  var forEach = createIterator(forEachIteratorOptions);

  /**
   * Creates an object composed of keys returned from running each element of
   * `collection` through a `callback`. The corresponding value of each key is an
   * array of elements passed to `callback` that returned the key. The `callback`
   * is bound to `thisArg` and invoked with three arguments; (value, index|key, collection).
   * The `callback` argument may also be the name of a property to group by (e.g. 'length').
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function|String} callback|property The function called per iteration
   *  or property name to group by.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Object} Returns the composed aggregate object.
   * @example
   *
   * _.groupBy([4.2, 6.1, 6.4], function(num) { return Math.floor(num); });
   * // => { '4': [4.2], '6': [6.1, 6.4] }
   *
   * _.groupBy([4.2, 6.1, 6.4], function(num) { return this.floor(num); }, Math);
   * // => { '4': [4.2], '6': [6.1, 6.4] }
   *
   * _.groupBy(['one', 'two', 'three'], 'length');
   * // => { '3': ['one', 'two'], '5': ['three'] }
   */
  function groupBy(collection, callback, thisArg) {
    var result = {};
    callback = createCallback(callback, thisArg);
    forEach(collection, function(value, key, collection) {
      key = callback(value, key, collection);
      (hasOwnProperty.call(result, key) ? result[key] : result[key] = []).push(value);
    });
    return result;
  }

  /**
   * Invokes the method named by `methodName` on each element in the `collection`,
   * returning an array of the results of each invoked method. Additional arguments
   * will be passed to each invoked method. If `methodName` is a function it will
   * be invoked for, and `this` bound to, each element in the `collection`.
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function|String} methodName The name of the method to invoke or
   *  the function invoked per iteration.
   * @param {Mixed} [arg1, arg2, ...] Arguments to invoke the method with.
   * @returns {Array} Returns a new array of the results of each invoked method.
   * @example
   *
   * _.invoke([[5, 1, 7], [3, 2, 1]], 'sort');
   * // => [[1, 5, 7], [1, 2, 3]]
   *
   * _.invoke([123, 456], String.prototype.split, '');
   * // => [['1', '2', '3'], ['4', '5', '6']]
   */
  function invoke(collection, methodName) {
    var args = slice.call(arguments, 2),
        isFunc = typeof methodName == 'function',
        result = [];

    forEach(collection, function(value) {
      result.push((isFunc ? methodName : value[methodName]).apply(value, args));
    });
    return result;
  }

  /**
   * Creates an array of values by running each element in the `collection`
   * through a `callback`. The `callback` is bound to `thisArg` and invoked with
   * three arguments; (value, index|key, collection).
   *
   * @static
   * @memberOf _
   * @alias collect
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function} [callback=identity] The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Array} Returns a new array of the results of each `callback` execution.
   * @example
   *
   * _.map([1, 2, 3], function(num) { return num * 3; });
   * // => [3, 6, 9]
   *
   * _.map({ 'one': 1, 'two': 2, 'three': 3 }, function(num) { return num * 3; });
   * // => [3, 6, 9] (order is not guaranteed)
   */
  function map(collection, callback, thisArg) {
    var index = -1,
        length = collection ? collection.length : 0,
        result = Array(typeof length == 'number' ? length : 0);

    callback = createCallback(callback, thisArg);
    if (isArray(collection)) {
      while (++index < length) {
        result[index] = callback(collection[index], index, collection);
      }
    } else {
      forEach(collection, function(value, key, collection) {
        result[++index] = callback(value, key, collection);
      });
    }
    return result;
  }

  /**
   * Retrieves the maximum value of an `array`. If `callback` is passed,
   * it will be executed for each value in the `array` to generate the
   * criterion by which the value is ranked. The `callback` is bound to
   * `thisArg` and invoked with three arguments; (value, index, collection).
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function} [callback] The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Mixed} Returns the maximum value.
   * @example
   *
   * var stooges = [
   *   { 'name': 'moe', 'age': 40 },
   *   { 'name': 'larry', 'age': 50 },
   *   { 'name': 'curly', 'age': 60 }
   * ];
   *
   * _.max(stooges, function(stooge) { return stooge.age; });
   * // => { 'name': 'curly', 'age': 60 };
   */
  function max(collection, callback, thisArg) {
    var computed = -Infinity,
        index = -1,
        length = collection ? collection.length : 0,
        result = computed;

    if (callback || !isArray(collection)) {
      callback = !callback && isString(collection)
        ? charAtCallback
        : createCallback(callback, thisArg);

      forEach(collection, function(value, index, collection) {
        var current = callback(value, index, collection);
        if (current > computed) {
          computed = current;
          result = value;
        }
      });
    } else {
      while (++index < length) {
        if (collection[index] > result) {
          result = collection[index];
        }
      }
    }
    return result;
  }

  /**
   * Retrieves the minimum value of an `array`. If `callback` is passed,
   * it will be executed for each value in the `array` to generate the
   * criterion by which the value is ranked. The `callback` is bound to `thisArg`
   * and invoked with three arguments; (value, index, collection).
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function} [callback] The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Mixed} Returns the minimum value.
   * @example
   *
   * _.min([10, 5, 100, 2, 1000]);
   * // => 2
   */
  function min(collection, callback, thisArg) {
    var computed = Infinity,
        index = -1,
        length = collection ? collection.length : 0,
        result = computed;

    if (callback || !isArray(collection)) {
      callback = !callback && isString(collection)
        ? charAtCallback
        : createCallback(callback, thisArg);

      forEach(collection, function(value, index, collection) {
        var current = callback(value, index, collection);
        if (current < computed) {
          computed = current;
          result = value;
        }
      });
    } else {
      while (++index < length) {
        if (collection[index] < result) {
          result = collection[index];
        }
      }
    }
    return result;
  }

  /**
   * Retrieves the value of a specified property from all elements in
   * the `collection`.
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {String} property The property to pluck.
   * @returns {Array} Returns a new array of property values.
   * @example
   *
   * var stooges = [
   *   { 'name': 'moe', 'age': 40 },
   *   { 'name': 'larry', 'age': 50 },
   *   { 'name': 'curly', 'age': 60 }
   * ];
   *
   * _.pluck(stooges, 'name');
   * // => ['moe', 'larry', 'curly']
   */
  function pluck(collection, property) {
    var result = [];
    forEach(collection, function(value) {
      result.push(value[property]);
    });
    return result;
  }

  /**
   * Boils down a `collection` to a single value. The initial state of the
   * reduction is `accumulator` and each successive step of it should be returned
   * by the `callback`. The `callback` is bound to `thisArg` and invoked with 4
   * arguments; for arrays they are (accumulator, value, index|key, collection).
   *
   * @static
   * @memberOf _
   * @alias foldl, inject
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function} callback The function called per iteration.
   * @param {Mixed} [accumulator] Initial value of the accumulator.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Mixed} Returns the accumulated value.
   * @example
   *
   * var sum = _.reduce([1, 2, 3], function(memo, num) { return memo + num; });
   * // => 6
   */
  function reduce(collection, callback, accumulator, thisArg) {
    var noaccum = arguments.length < 3;
    callback = createCallback(callback, thisArg);
    forEach(collection, function(value, index, collection) {
      accumulator = noaccum
        ? (noaccum = false, value)
        : callback(accumulator, value, index, collection)
    });
    return accumulator;
  }

  /**
   * The right-associative version of `_.reduce`.
   *
   * @static
   * @memberOf _
   * @alias foldr
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function} callback The function called per iteration.
   * @param {Mixed} [accumulator] Initial value of the accumulator.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Mixed} Returns the accumulated value.
   * @example
   *
   * var list = [[0, 1], [2, 3], [4, 5]];
   * var flat = _.reduceRight(list, function(a, b) { return a.concat(b); }, []);
   * // => [4, 5, 2, 3, 0, 1]
   */
  function reduceRight(collection, callback, accumulator, thisArg) {
    var iteratee = collection,
        length = collection ? collection.length : 0,
        noaccum = arguments.length < 3;

    if (typeof length != 'number') {
      var props = keys(collection);
      length = props.length;
    } else if (noCharByIndex && isString(collection)) {
      iteratee = collection.split('');
    }
    forEach(collection, function(value, index, collection) {
      index = props ? props[--length] : --length;
      accumulator = noaccum
        ? (noaccum = false, iteratee[index])
        : callback.call(thisArg, accumulator, iteratee[index], index, collection);
    });
    return accumulator;
  }

  /**
   * The opposite of `_.filter`, this method returns the values of a
   * `collection` that `callback` does **not** return truthy for.
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function} [callback=identity] The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Array} Returns a new array of elements that did **not** pass the
   *  callback check.
   * @example
   *
   * var odds = _.reject([1, 2, 3, 4, 5, 6], function(num) { return num % 2 == 0; });
   * // => [1, 3, 5]
   */
  function reject(collection, callback, thisArg) {
    callback = createCallback(callback, thisArg);
    return filter(collection, function(value, index, collection) {
      return !callback(value, index, collection);
    });
  }

  /**
   * Creates an array of shuffled `array` values, using a version of the
   * Fisher-Yates shuffle. See http://en.wikipedia.org/wiki/Fisher-Yates_shuffle.
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to shuffle.
   * @returns {Array} Returns a new shuffled collection.
   * @example
   *
   * _.shuffle([1, 2, 3, 4, 5, 6]);
   * // => [4, 1, 6, 3, 5, 2]
   */
  function shuffle(collection) {
    var index = -1,
        result = Array(collection ? collection.length : 0);

    forEach(collection, function(value) {
      var rand = floor(nativeRandom() * (++index + 1));
      result[index] = result[rand];
      result[rand] = value;
    });
    return result;
  }

  /**
   * Gets the size of the `collection` by returning `collection.length` for arrays
   * and array-like objects or the number of own enumerable properties for objects.
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to inspect.
   * @returns {Number} Returns `collection.length` or number of own enumerable properties.
   * @example
   *
   * _.size([1, 2]);
   * // => 2
   *
   * _.size({ 'one': 1, 'two': 2, 'three': 3 });
   * // => 3
   *
   * _.size('curly');
   * // => 5
   */
  function size(collection) {
    var length = collection ? collection.length : 0;
    return typeof length == 'number' ? length : keys(collection).length;
  }

  /**
   * Checks if the `callback` returns a truthy value for **any** element of a
   * `collection`. The function returns as soon as it finds passing value, and
   * does not iterate over the entire `collection`. The `callback` is bound to
   * `thisArg` and invoked with three arguments; (value, index|key, collection).
   *
   * @static
   * @memberOf _
   * @alias any
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function} [callback=identity] The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Boolean} Returns `true` if any element passes the callback check,
   *  else `false`.
   * @example
   *
   * _.some([null, 0, 'yes', false], Boolean);
   * // => true
   */
  function some(collection, callback, thisArg) {
    var result;
    callback = createCallback(callback, thisArg);

    if (isArray(collection)) {
      var index = -1,
          length = collection.length;

      while (++index < length) {
        if ((result = callback(collection[index], index, collection))) {
          break;
        }
      }
    } else {
      forEach(collection, function(value, index, collection) {
        return !(result = callback(value, index, collection));
      });
    }
    return !!result;
  }

  /**
   * Creates an array, stable sorted in ascending order by the results of
   * running each element of `collection` through a `callback`. The `callback`
   * is bound to `thisArg` and invoked with three arguments; (value, index|key, collection).
   * The `callback` argument may also be the name of a property to sort by (e.g. 'length').
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Function|String} callback|property The function called per iteration
   *  or property name to sort by.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Array} Returns a new array of sorted elements.
   * @example
   *
   * _.sortBy([1, 2, 3], function(num) { return Math.sin(num); });
   * // => [3, 1, 2]
   *
   * _.sortBy([1, 2, 3], function(num) { return this.sin(num); }, Math);
   * // => [3, 1, 2]
   *
   * _.sortBy(['larry', 'brendan', 'moe'], 'length');
   * // => ['moe', 'larry', 'brendan']
   */
  function sortBy(collection, callback, thisArg) {
    var result = [];
    callback = createCallback(callback, thisArg);
    forEach(collection, function(value, index, collection) {
      result.push({
        'criteria': callback(value, index, collection),
        'index': index,
        'value': value
      });
    });

    var length = result.length;
    result.sort(compareAscending);
    while (length--) {
      result[length] = result[length].value;
    }
    return result;
  }

  /**
   * Converts the `collection`, to an array.
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to convert.
   * @returns {Array} Returns the new converted array.
   * @example
   *
   * (function() { return _.toArray(arguments).slice(1); })(1, 2, 3, 4);
   * // => [2, 3, 4]
   */
  function toArray(collection) {
    if (collection && typeof collection.length == 'number') {
      return (noArraySliceOnStrings ? isString(collection) : typeof collection == 'string')
        ? collection.split('')
        : slice.call(collection);
    }
    return values(collection);
  }

  /**
   * Examines each element in a `collection`, returning an array of all elements
   * that contain the given `properties`.
   *
   * @static
   * @memberOf _
   * @category Collections
   * @param {Array|Object|String} collection The collection to iterate over.
   * @param {Object} properties The object of property values to filter by.
   * @returns {Array} Returns a new array of elements that contain the given `properties`.
   * @example
   *
   * var stooges = [
   *   { 'name': 'moe', 'age': 40 },
   *   { 'name': 'larry', 'age': 50 },
   *   { 'name': 'curly', 'age': 60 }
   * ];
   *
   * _.where(stooges, { 'age': 40 });
   * // => [{ 'name': 'moe', 'age': 40 }]
   */
  function where(collection, properties) {
    var props = keys(properties);
    return filter(collection, function(object) {
      var length = props.length;
      while (length--) {
        var result = object[props[length]] === properties[props[length]];
        if (!result) {
          break;
        }
      }
      return !!result;
    });
  }

  /*--------------------------------------------------------------------------*/

  /**
   * Creates an array with all falsey values of `array` removed. The values
   * `false`, `null`, `0`, `""`, `undefined` and `NaN` are all falsey.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} array The array to compact.
   * @returns {Array} Returns a new filtered array.
   * @example
   *
   * _.compact([0, 1, false, 2, '', 3]);
   * // => [1, 2, 3]
   */
  function compact(array) {
    var index = -1,
        length = array ? array.length : 0,
        result = [];

    while (++index < length) {
      var value = array[index];
      if (value) {
        result.push(value);
      }
    }
    return result;
  }

  /**
   * Creates an array of `array` elements not present in the other arrays
   * using strict equality for comparisons, i.e. `===`.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} array The array to process.
   * @param {Array} [array1, array2, ...] Arrays to check.
   * @returns {Array} Returns a new array of `array` elements not present in the
   *  other arrays.
   * @example
   *
   * _.difference([1, 2, 3, 4, 5], [5, 2, 10]);
   * // => [1, 3, 4]
   */
  function difference(array) {
    var index = -1,
        length = array ? array.length : 0,
        flattened = concat.apply(arrayRef, arguments),
        contains = cachedContains(flattened, length),
        result = [];

    while (++index < length) {
      var value = array[index];
      if (!contains(value)) {
        result.push(value);
      }
    }
    return result;
  }

  /**
   * Gets the first element of the `array`. Pass `n` to return the first `n`
   * elements of the `array`.
   *
   * @static
   * @memberOf _
   * @alias head, take
   * @category Arrays
   * @param {Array} array The array to query.
   * @param {Number} [n] The number of elements to return.
   * @param- {Object} [guard] Internally used to allow this method to work with
   *  others like `_.map` without using their callback `index` argument for `n`.
   * @returns {Mixed} Returns the first element or an array of the first `n`
   *  elements of `array`.
   * @example
   *
   * _.first([5, 4, 3, 2, 1]);
   * // => 5
   */
  function first(array, n, guard) {
    if (array) {
      return (n == null || guard) ? array[0] : slice.call(array, 0, n);
    }
  }

  /**
   * Flattens a nested array (the nesting can be to any depth). If `shallow` is
   * truthy, `array` will only be flattened a single level.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} array The array to compact.
   * @param {Boolean} shallow A flag to indicate only flattening a single level.
   * @returns {Array} Returns a new flattened array.
   * @example
   *
   * _.flatten([1, [2], [3, [[4]]]]);
   * // => [1, 2, 3, 4];
   *
   * _.flatten([1, [2], [3, [[4]]]], true);
   * // => [1, 2, 3, [[4]]];
   */
  function flatten(array, shallow) {
    var index = -1,
        length = array ? array.length : 0,
        result = [];

    while (++index < length) {
      var value = array[index];

      // recursively flatten arrays (susceptible to call stack limits)
      if (isArray(value)) {
        push.apply(result, shallow ? value : flatten(value));
      } else {
        result.push(value);
      }
    }
    return result;
  }

  /**
   * Gets the index at which the first occurrence of `value` is found using
   * strict equality for comparisons, i.e. `===`. If the `array` is already
   * sorted, passing `true` for `fromIndex` will run a faster binary search.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} array The array to search.
   * @param {Mixed} value The value to search for.
   * @param {Boolean|Number} [fromIndex=0] The index to search from or `true` to
   *  perform a binary search on a sorted `array`.
   * @returns {Number} Returns the index of the matched value or `-1`.
   * @example
   *
   * _.indexOf([1, 2, 3, 1, 2, 3], 2);
   * // => 1
   *
   * _.indexOf([1, 2, 3, 1, 2, 3], 2, 3);
   * // => 4
   *
   * _.indexOf([1, 1, 2, 2, 3, 3], 2, true);
   * // => 2
   */
  function indexOf(array, value, fromIndex) {
    var index = -1,
        length = array ? array.length : 0;

    if (typeof fromIndex == 'number') {
      index = (fromIndex < 0 ? nativeMax(0, length + fromIndex) : fromIndex || 0) - 1;
    } else if (fromIndex) {
      index = sortedIndex(array, value);
      return array[index] === value ? index : -1;
    }
    while (++index < length) {
      if (array[index] === value) {
        return index;
      }
    }
    return -1;
  }

  /**
   * Gets all but the last element of `array`. Pass `n` to exclude the last `n`
   * elements from the result.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} array The array to query.
   * @param {Number} [n=1] The number of elements to exclude.
   * @param- {Object} [guard] Internally used to allow this method to work with
   *  others like `_.map` without using their callback `index` argument for `n`.
   * @returns {Array} Returns all but the last element or `n` elements of `array`.
   * @example
   *
   * _.initial([3, 2, 1]);
   * // => [3, 2]
   */
  function initial(array, n, guard) {
    return array
      ? slice.call(array, 0, -((n == null || guard) ? 1 : n))
      : [];
  }

  /**
   * Computes the intersection of all the passed-in arrays using strict equality
   * for comparisons, i.e. `===`.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} [array1, array2, ...] Arrays to process.
   * @returns {Array} Returns a new array of unique elements, in order, that are
   *  present in **all** of the arrays.
   * @example
   *
   * _.intersection([1, 2, 3], [101, 2, 1, 10], [2, 1]);
   * // => [1, 2]
   */
  function intersection(array) {
    var args = arguments,
        argsLength = args.length,
        cache = {},
        result = [];

    forEach(array, function(value) {
      if (indexOf(result, value) < 0) {
        var length = argsLength;
        while (--length) {
          if (!(cache[length] || (cache[length] = cachedContains(args[length])))(value)) {
            return;
          }
        }
        result.push(value);
      }
    });
    return result;
  }

  /**
   * Gets the last element of the `array`. Pass `n` to return the last `n`
   * elements of the `array`.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} array The array to query.
   * @param {Number} [n] The number of elements to return.
   * @param- {Object} [guard] Internally used to allow this method to work with
   *  others like `_.map` without using their callback `index` argument for `n`.
   * @returns {Mixed} Returns the last element or an array of the last `n`
   *  elements of `array`.
   * @example
   *
   * _.last([3, 2, 1]);
   * // => 1
   */
  function last(array, n, guard) {
    if (array) {
      var length = array.length;
      return (n == null || guard) ? array[length - 1] : slice.call(array, -n || length);
    }
  }

  /**
   * Gets the index at which the last occurrence of `value` is found using strict
   * equality for comparisons, i.e. `===`. If `fromIndex` is negative, it is used
   * as the offset from the end of the collection.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} array The array to search.
   * @param {Mixed} value The value to search for.
   * @param {Number} [fromIndex=array.length-1] The index to search from.
   * @returns {Number} Returns the index of the matched value or `-1`.
   * @example
   *
   * _.lastIndexOf([1, 2, 3, 1, 2, 3], 2);
   * // => 4
   *
   * _.lastIndexOf([1, 2, 3, 1, 2, 3], 2, 3);
   * // => 1
   */
  function lastIndexOf(array, value, fromIndex) {
    var index = array ? array.length : 0;
    if (typeof fromIndex == 'number') {
      index = (fromIndex < 0 ? nativeMax(0, index + fromIndex) : nativeMin(fromIndex, index - 1)) + 1;
    }
    while (index--) {
      if (array[index] === value) {
        return index;
      }
    }
    return -1;
  }

  /**
   * Creates an object composed from arrays of `keys` and `values`. Pass either
   * a single two dimensional array, i.e. `[[key1, value1], [key2, value2]]`, or
   * two arrays, one of `keys` and one of corresponding `values`.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} keys The array of keys.
   * @param {Array} [values=[]] The array of values.
   * @returns {Object} Returns an object composed of the given keys and
   *  corresponding values.
   * @example
   *
   * _.object(['moe', 'larry', 'curly'], [30, 40, 50]);
   * // => { 'moe': 30, 'larry': 40, 'curly': 50 }
   */
  function object(keys, values) {
    var index = -1,
        length = keys ? keys.length : 0,
        result = {};

    while (++index < length) {
      var key = keys[index];
      if (values) {
        result[key] = values[index];
      } else {
        result[key[0]] = key[1];
      }
    }
    return result;
  }

  /**
   * Creates an array of numbers (positive and/or negative) progressing from
   * `start` up to but not including `stop`. This method is a port of Python's
   * `range()` function. See http://docs.python.org/library/functions.html#range.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Number} [start=0] The start of the range.
   * @param {Number} end The end of the range.
   * @param {Number} [step=1] The value to increment or descrement by.
   * @returns {Array} Returns a new range array.
   * @example
   *
   * _.range(10);
   * // => [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
   *
   * _.range(1, 11);
   * // => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
   *
   * _.range(0, 30, 5);
   * // => [0, 5, 10, 15, 20, 25]
   *
   * _.range(0, -10, -1);
   * // => [0, -1, -2, -3, -4, -5, -6, -7, -8, -9]
   *
   * _.range(0);
   * // => []
   */
  function range(start, end, step) {
    start = +start || 0;
    step = +step || 1;

    if (end == null) {
      end = start;
      start = 0;
    }
    // use `Array(length)` so V8 will avoid the slower "dictionary" mode
    // http://www.youtube.com/watch?v=XAqIpGU8ZZk#t=16m27s
    var index = -1,
        length = nativeMax(0, ceil((end - start) / step)),
        result = Array(length);

    while (++index < length) {
      result[index] = start;
      start += step;
    }
    return result;
  }

  /**
   * The opposite of `_.initial`, this method gets all but the first value of
   * `array`. Pass `n` to exclude the first `n` values from the result.
   *
   * @static
   * @memberOf _
   * @alias drop, tail
   * @category Arrays
   * @param {Array} array The array to query.
   * @param {Number} [n=1] The number of elements to exclude.
   * @param- {Object} [guard] Internally used to allow this method to work with
   *  others like `_.map` without using their callback `index` argument for `n`.
   * @returns {Array} Returns all but the first value or `n` values of `array`.
   * @example
   *
   * _.rest([3, 2, 1]);
   * // => [2, 1]
   */
  function rest(array, n, guard) {
    return array
      ? slice.call(array, (n == null || guard) ? 1 : n)
      : [];
  }

  /**
   * Uses a binary search to determine the smallest index at which the `value`
   * should be inserted into `array` in order to maintain the sort order of the
   * sorted `array`. If `callback` is passed, it will be executed for `value` and
   * each element in `array` to compute their sort ranking. The `callback` is
   * bound to `thisArg` and invoked with one argument; (value). The `callback`
   * argument may also be the name of a property to order by.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} array The array to iterate over.
   * @param {Mixed} value The value to evaluate.
   * @param {Function|String} [callback=identity|property] The function called
   *  per iteration or property name to order by.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Number} Returns the index at which the value should be inserted
   *  into `array`.
   * @example
   *
   * _.sortedIndex([20, 30, 50], 40);
   * // => 2
   *
   * _.sortedIndex([{ 'x': 20 }, { 'x': 30 }, { 'x': 50 }], { 'x': 40 }, 'x');
   * // => 2
   *
   * var dict = {
   *   'wordToNumber': { 'twenty': 20, 'thirty': 30, 'fourty': 40, 'fifty': 50 }
   * };
   *
   * _.sortedIndex(['twenty', 'thirty', 'fifty'], 'fourty', function(word) {
   *   return dict.wordToNumber[word];
   * });
   * // => 2
   *
   * _.sortedIndex(['twenty', 'thirty', 'fifty'], 'fourty', function(word) {
   *   return this.wordToNumber[word];
   * }, dict);
   * // => 2
   */
  function sortedIndex(array, value, callback, thisArg) {
    var low = 0,
        high = array ? array.length : low;

    // explicitly reference `identity` for better engine inlining
    callback = callback ? createCallback(callback, thisArg) : identity;
    value = callback(value);
    while (low < high) {
      var mid = (low + high) >>> 1;
      callback(array[mid]) < value
        ? low = mid + 1
        : high = mid;
    }
    return low;
  }

  /**
   * Computes the union of the passed-in arrays using strict equality for
   * comparisons, i.e. `===`.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} [array1, array2, ...] Arrays to process.
   * @returns {Array} Returns a new array of unique values, in order, that are
   *  present in one or more of the arrays.
   * @example
   *
   * _.union([1, 2, 3], [101, 2, 1, 10], [2, 1]);
   * // => [1, 2, 3, 101, 10]
   */
  function union() {
    return uniq(concat.apply(arrayRef, arguments));
  }

  /**
   * Creates a duplicate-value-free version of the `array` using strict equality
   * for comparisons, i.e. `===`. If the `array` is already sorted, passing `true`
   * for `isSorted` will run a faster algorithm. If `callback` is passed, each
   * element of `array` is passed through a callback` before uniqueness is computed.
   * The `callback` is bound to `thisArg` and invoked with three arguments; (value, index, array).
   *
   * @static
   * @memberOf _
   * @alias unique
   * @category Arrays
   * @param {Array} array The array to process.
   * @param {Boolean} [isSorted=false] A flag to indicate that the `array` is already sorted.
   * @param {Function} [callback=identity] The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Array} Returns a duplicate-value-free array.
   * @example
   *
   * _.uniq([1, 2, 1, 3, 1]);
   * // => [1, 2, 3]
   *
   * _.uniq([1, 1, 2, 2, 3], true);
   * // => [1, 2, 3]
   *
   * _.uniq([1, 2, 1.5, 3, 2.5], function(num) { return Math.floor(num); });
   * // => [1, 2, 3]
   *
   * _.uniq([1, 2, 1.5, 3, 2.5], function(num) { return this.floor(num); }, Math);
   * // => [1, 2, 3]
   */
  function uniq(array, isSorted, callback, thisArg) {
    var index = -1,
        length = array ? array.length : 0,
        result = [],
        seen = result;

    // juggle arguments
    if (typeof isSorted == 'function') {
      thisArg = callback;
      callback = isSorted;
      isSorted = false;
    }
    // init value cache for large arrays
    var isLarge = !isSorted && length > 74;
    if (isLarge) {
      var cache = {};
    }
    if (callback) {
      seen = [];
      callback = createCallback(callback, thisArg);
    }
    while (++index < length) {
      var value = array[index],
          computed = callback ? callback(value, index, array) : value;

      if (isLarge) {
        // manually coerce `computed` to a string because `hasOwnProperty`, in
        // some older versions of Firefox, coerces objects incorrectly
        seen = hasOwnProperty.call(cache, computed + '') ? cache[computed] : (cache[computed] = []);
      }
      if (isSorted
            ? !index || seen[seen.length - 1] !== computed
            : indexOf(seen, computed) < 0
          ) {
        if (callback || isLarge) {
          seen.push(computed);
        }
        result.push(value);
      }
    }
    return result;
  }

  /**
   * Creates an array with all occurrences of the passed values removed using
   * strict equality for comparisons, i.e. `===`.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} array The array to filter.
   * @param {Mixed} [value1, value2, ...] Values to remove.
   * @returns {Array} Returns a new filtered array.
   * @example
   *
   * _.without([1, 2, 1, 0, 3, 1, 4], 0, 1);
   * // => [2, 3, 4]
   */
  function without(array) {
    var index = -1,
        length = array ? array.length : 0,
        contains = cachedContains(arguments, 1, 20),
        result = [];

    while (++index < length) {
      var value = array[index];
      if (!contains(value)) {
        result.push(value);
      }
    }
    return result;
  }

  /**
   * Groups the elements of each array at their corresponding indexes. Useful for
   * separate data sources that are coordinated through matching array indexes.
   * For a matrix of nested arrays, `_.zip.apply(...)` can transpose the matrix
   * in a similar fashion.
   *
   * @static
   * @memberOf _
   * @category Arrays
   * @param {Array} [array1, array2, ...] Arrays to process.
   * @returns {Array} Returns a new array of grouped elements.
   * @example
   *
   * _.zip(['moe', 'larry', 'curly'], [30, 40, 50], [true, false, false]);
   * // => [['moe', 30, true], ['larry', 40, false], ['curly', 50, false]]
   */
  function zip(array) {
    var index = -1,
        length = array ? max(pluck(arguments, 'length')) : 0,
        result = Array(length);

    while (++index < length) {
      result[index] = pluck(arguments, index);
    }
    return result;
  }

  /*--------------------------------------------------------------------------*/

  /**
   * Creates a function that is restricted to executing `func` only after it is
   * called `n` times. The `func` is executed with the `this` binding of the
   * created function.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Number} n The number of times the function must be called before
   * it is executed.
   * @param {Function} func The function to restrict.
   * @returns {Function} Returns the new restricted function.
   * @example
   *
   * var renderNotes = _.after(notes.length, render);
   * _.forEach(notes, function(note) {
   *   note.asyncSave({ 'success': renderNotes });
   * });
   * // `renderNotes` is run once, after all notes have saved
   */
  function after(n, func) {
    if (n < 1) {
      return func();
    }
    return function() {
      if (--n < 1) {
        return func.apply(this, arguments);
      }
    };
  }

  /**
   * Creates a function that, when called, invokes `func` with the `this`
   * binding of `thisArg` and prepends any additional `bind` arguments to those
   * passed to the bound function.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Function} func The function to bind.
   * @param {Mixed} [thisArg] The `this` binding of `func`.
   * @param {Mixed} [arg1, arg2, ...] Arguments to be partially applied.
   * @returns {Function} Returns the new bound function.
   * @example
   *
   * var func = function(greeting) {
   *   return greeting + ' ' + this.name;
   * };
   *
   * func = _.bind(func, { 'name': 'moe' }, 'hi');
   * func();
   * // => 'hi moe'
   */
  function bind(func, thisArg) {
    // use `Function#bind` if it exists and is fast
    // (in V8 `Function#bind` is slower except when partially applied)
    return isBindFast || (nativeBind && arguments.length > 2)
      ? nativeBind.call.apply(nativeBind, arguments)
      : createBound(func, thisArg, slice.call(arguments, 2));
  }

  /**
   * Binds methods on `object` to `object`, overwriting the existing method.
   * If no method names are provided, all the function properties of `object`
   * will be bound.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Object} object The object to bind and assign the bound methods to.
   * @param {String} [methodName1, methodName2, ...] Method names on the object to bind.
   * @returns {Object} Returns `object`.
   * @example
   *
   * var buttonView = {
   *  'label': 'lodash',
   *  'onClick': function() { alert('clicked: ' + this.label); }
   * };
   *
   * _.bindAll(buttonView);
   * jQuery('#lodash_button').on('click', buttonView.onClick);
   * // => When the button is clicked, `this.label` will have the correct value
   */
  function bindAll(object) {
    var funcs = arguments,
        index = funcs.length > 1 ? 0 : (funcs = functions(object), -1),
        length = funcs.length;

    while (++index < length) {
      var key = funcs[index];
      object[key] = bind(object[key], object);
    }
    return object;
  }

  /**
   * Creates a function that, when called, invokes the method at `object[key]`
   * and prepends any additional `bindKey` arguments to those passed to the bound
   * function. This method differs from `_.bind` by allowing bound functions to
   * reference methods that will be redefined or don't yet exist.
   * See http://michaux.ca/articles/lazy-function-definition-pattern.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Object} object The object the method belongs to.
   * @param {String} key The key of the method.
   * @param {Mixed} [arg1, arg2, ...] Arguments to be partially applied.
   * @returns {Function} Returns the new bound function.
   * @example
   *
   * var object = {
   *   'name': 'moe',
   *   'greet': function(greeting) {
   *     return greeting + ' ' + this.name;
   *   }
   * };
   *
   * var func = _.bindKey(object, 'greet', 'hi');
   * func();
   * // => 'hi moe'
   *
   * object.greet = function(greeting) {
   *   return greeting + ', ' + this.name + '!';
   * };
   *
   * func();
   * // => 'hi, moe!'
   */
  function bindKey(object, key) {
    return createBound(object, key, slice.call(arguments, 2));
  }

  /**
   * Creates a function that is the composition of the passed functions,
   * where each function consumes the return value of the function that follows.
   * In math terms, composing the functions `f()`, `g()`, and `h()` produces `f(g(h()))`.
   * Each function is executed with the `this` binding of the composed function.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Function} [func1, func2, ...] Functions to compose.
   * @returns {Function} Returns the new composed function.
   * @example
   *
   * var greet = function(name) { return 'hi: ' + name; };
   * var exclaim = function(statement) { return statement + '!'; };
   * var welcome = _.compose(exclaim, greet);
   * welcome('moe');
   * // => 'hi: moe!'
   */
  function compose() {
    var funcs = arguments;
    return function() {
      var args = arguments,
          length = funcs.length;

      while (length--) {
        args = [funcs[length].apply(this, args)];
      }
      return args[0];
    };
  }

  /**
   * Creates a function that will delay the execution of `func` until after
   * `wait` milliseconds have elapsed since the last time it was invoked. Pass
   * `true` for `immediate` to cause debounce to invoke `func` on the leading,
   * instead of the trailing, edge of the `wait` timeout. Subsequent calls to
   * the debounced function will return the result of the last `func` call.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Function} func The function to debounce.
   * @param {Number} wait The number of milliseconds to delay.
   * @param {Boolean} immediate A flag to indicate execution is on the leading
   *  edge of the timeout.
   * @returns {Function} Returns the new debounced function.
   * @example
   *
   * var lazyLayout = _.debounce(calculateLayout, 300);
   * jQuery(window).on('resize', lazyLayout);
   */
  function debounce(func, wait, immediate) {
    var args,
        result,
        thisArg,
        timeoutId;

    function delayed() {
      timeoutId = null;
      if (!immediate) {
        result = func.apply(thisArg, args);
      }
    }
    return function() {
      var isImmediate = immediate && !timeoutId;
      args = arguments;
      thisArg = this;

      clearTimeout(timeoutId);
      timeoutId = setTimeout(delayed, wait);

      if (isImmediate) {
        result = func.apply(thisArg, args);
      }
      return result;
    };
  }

  /**
   * Executes the `func` function after `wait` milliseconds. Additional arguments
   * will be passed to `func` when it is invoked.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Function} func The function to delay.
   * @param {Number} wait The number of milliseconds to delay execution.
   * @param {Mixed} [arg1, arg2, ...] Arguments to invoke the function with.
   * @returns {Number} Returns the `setTimeout` timeout id.
   * @example
   *
   * var log = _.bind(console.log, console);
   * _.delay(log, 1000, 'logged later');
   * // => 'logged later' (Appears after one second.)
   */
  function delay(func, wait) {
    var args = slice.call(arguments, 2);
    return setTimeout(function() { func.apply(undefined, args); }, wait);
  }

  /**
   * Defers executing the `func` function until the current call stack has cleared.
   * Additional arguments will be passed to `func` when it is invoked.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Function} func The function to defer.
   * @param {Mixed} [arg1, arg2, ...] Arguments to invoke the function with.
   * @returns {Number} Returns the `setTimeout` timeout id.
   * @example
   *
   * _.defer(function() { alert('deferred'); });
   * // returns from the function before `alert` is called
   */
  function defer(func) {
    var args = slice.call(arguments, 1);
    return setTimeout(function() { func.apply(undefined, args); }, 1);
  }

  /**
   * Creates a function that memoizes the result of `func`. If `resolver` is
   * passed, it will be used to determine the cache key for storing the result
   * based on the arguments passed to the memoized function. By default, the first
   * argument passed to the memoized function is used as the cache key. The `func`
   * is executed with the `this` binding of the memoized function.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Function} func The function to have its output memoized.
   * @param {Function} [resolver] A function used to resolve the cache key.
   * @returns {Function} Returns the new memoizing function.
   * @example
   *
   * var fibonacci = _.memoize(function(n) {
   *   return n < 2 ? n : fibonacci(n - 1) + fibonacci(n - 2);
   * });
   */
  function memoize(func, resolver) {
    var cache = {};
    return function() {
      var key = resolver ? resolver.apply(this, arguments) : arguments[0];
      return hasOwnProperty.call(cache, key)
        ? cache[key]
        : (cache[key] = func.apply(this, arguments));
    };
  }

  /**
   * Creates a function that is restricted to execute `func` once. Repeat calls to
   * the function will return the value of the first call. The `func` is executed
   * with the `this` binding of the created function.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Function} func The function to restrict.
   * @returns {Function} Returns the new restricted function.
   * @example
   *
   * var initialize = _.once(createApplication);
   * initialize();
   * initialize();
   * // Application is only created once.
   */
  function once(func) {
    var result,
        ran = false;

    return function() {
      if (ran) {
        return result;
      }
      ran = true;
      result = func.apply(this, arguments);

      // clear the `func` variable so the function may be garbage collected
      func = null;
      return result;
    };
  }

  /**
   * Creates a function that, when called, invokes `func` with any additional
   * `partial` arguments prepended to those passed to the new function. This
   * method is similar to `bind`, except it does **not** alter the `this` binding.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Function} func The function to partially apply arguments to.
   * @param {Mixed} [arg1, arg2, ...] Arguments to be partially applied.
   * @returns {Function} Returns the new partially applied function.
   * @example
   *
   * var greet = function(greeting, name) { return greeting + ': ' + name; };
   * var hi = _.partial(greet, 'hi');
   * hi('moe');
   * // => 'hi: moe'
   */
  function partial(func) {
    return createBound(func, slice.call(arguments, 1));
  }

  /**
   * Creates a function that, when executed, will only call the `func`
   * function at most once per every `wait` milliseconds. If the throttled
   * function is invoked more than once during the `wait` timeout, `func` will
   * also be called on the trailing edge of the timeout. Subsequent calls to the
   * throttled function will return the result of the last `func` call.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Function} func The function to throttle.
   * @param {Number} wait The number of milliseconds to throttle executions to.
   * @returns {Function} Returns the new throttled function.
   * @example
   *
   * var throttled = _.throttle(updatePosition, 100);
   * jQuery(window).on('scroll', throttled);
   */
  function throttle(func, wait) {
    var args,
        result,
        thisArg,
        timeoutId,
        lastCalled = 0;

    function trailingCall() {
      lastCalled = new Date;
      timeoutId = null;
      result = func.apply(thisArg, args);
    }
    return function() {
      var now = new Date,
          remaining = wait - (now - lastCalled);

      args = arguments;
      thisArg = this;

      if (remaining <= 0) {
        clearTimeout(timeoutId);
        lastCalled = now;
        result = func.apply(thisArg, args);
      }
      else if (!timeoutId) {
        timeoutId = setTimeout(trailingCall, remaining);
      }
      return result;
    };
  }

  /**
   * Creates a function that passes `value` to the `wrapper` function as its
   * first argument. Additional arguments passed to the function are appended
   * to those passed to the `wrapper` function. The `wrapper` is executed with
   * the `this` binding of the created function.
   *
   * @static
   * @memberOf _
   * @category Functions
   * @param {Mixed} value The value to wrap.
   * @param {Function} wrapper The wrapper function.
   * @returns {Function} Returns the new function.
   * @example
   *
   * var hello = function(name) { return 'hello ' + name; };
   * hello = _.wrap(hello, function(func) {
   *   return 'before, ' + func('moe') + ', after';
   * });
   * hello();
   * // => 'before, hello moe, after'
   */
  function wrap(value, wrapper) {
    return function() {
      var args = [value];
      push.apply(args, arguments);
      return wrapper.apply(this, args);
    };
  }

  /*--------------------------------------------------------------------------*/

  /**
   * Converts the characters `&`, `<`, `>`, `"`, and `'` in `string` to their
   * corresponding HTML entities.
   *
   * @static
   * @memberOf _
   * @category Utilities
   * @param {String} string The string to escape.
   * @returns {String} Returns the escaped string.
   * @example
   *
   * _.escape('Moe, Larry & Curly');
   * // => "Moe, Larry &amp; Curly"
   */
  function escape(string) {
    return string == null ? '' : (string + '').replace(reUnescapedHtml, escapeHtmlChar);
  }

  /**
   * This function returns the first argument passed to it.
   *
   * Note: It is used throughout Lo-Dash as a default callback.
   *
   * @static
   * @memberOf _
   * @category Utilities
   * @param {Mixed} value Any value.
   * @returns {Mixed} Returns `value`.
   * @example
   *
   * var moe = { 'name': 'moe' };
   * moe === _.identity(moe);
   * // => true
   */
  function identity(value) {
    return value;
  }

  /**
   * Adds functions properties of `object` to the `lodash` function and chainable
   * wrapper.
   *
   * @static
   * @memberOf _
   * @category Utilities
   * @param {Object} object The object of function properties to add to `lodash`.
   * @example
   *
   * _.mixin({
   *   'capitalize': function(string) {
   *     return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
   *   }
   * });
   *
   * _.capitalize('larry');
   * // => 'Larry'
   *
   * _('curly').capitalize();
   * // => 'Curly'
   */
  function mixin(object) {
    forEach(functions(object), function(methodName) {
      var func = lodash[methodName] = object[methodName];

      lodash.prototype[methodName] = function() {
        var args = [this.__wrapped__];
        push.apply(args, arguments);

        var result = func.apply(lodash, args);
        if (this.__chain__) {
          result = new lodash(result);
          result.__chain__ = true;
        }
        return result;
      };
    });
  }

  /**
   * Reverts the '_' variable to its previous value and returns a reference to
   * the `lodash` function.
   *
   * @static
   * @memberOf _
   * @category Utilities
   * @returns {Function} Returns the `lodash` function.
   * @example
   *
   * var lodash = _.noConflict();
   */
  function noConflict() {
    window._ = oldDash;
    return this;
  }

  /**
   * Produces a random number between `min` and `max` (inclusive). If only one
   * argument is passed, a number between `0` and the given number will be returned.
   *
   * @static
   * @memberOf _
   * @category Utilities
   * @param {Number} [min=0] The minimum possible value.
   * @param {Number} [max=1] The maximum possible value.
   * @returns {Number} Returns a random number.
   * @example
   *
   * _.random(0, 5);
   * // => a number between 1 and 5
   *
   * _.random(5);
   * // => also a number between 1 and 5
   */
  function random(min, max) {
    if (min == null && max == null) {
      max = 1;
    }
    min = +min || 0;
    if (max == null) {
      max = min;
      min = 0;
    }
    return min + floor(nativeRandom() * ((+max || 0) - min + 1));
  }

  /**
   * Resolves the value of `property` on `object`. If `property` is a function
   * it will be invoked and its result returned, else the property value is
   * returned. If `object` is falsey, then `null` is returned.
   *
   * @deprecated
   * @static
   * @memberOf _
   * @category Utilities
   * @param {Object} object The object to inspect.
   * @param {String} property The property to get the value of.
   * @returns {Mixed} Returns the resolved value.
   * @example
   *
   * var object = {
   *   'cheese': 'crumpets',
   *   'stuff': function() {
   *     return 'nonsense';
   *   }
   * };
   *
   * _.result(object, 'cheese');
   * // => 'crumpets'
   *
   * _.result(object, 'stuff');
   * // => 'nonsense'
   */
  function result(object, property) {
    // based on Backbone's private `getValue` function
    // https://github.com/documentcloud/backbone/blob/0.9.2/backbone.js#L1419-1424
    var value = object ? object[property] : null;
    return isFunction(value) ? object[property]() : value;
  }

  /**
   * A micro-templating method that handles arbitrary delimiters, preserves
   * whitespace, and correctly escapes quotes within interpolated code.
   *
   * Note: In the development build `_.template` utilizes sourceURLs for easier
   * debugging. See http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/#toc-sourceurl
   *
   * Note: Lo-Dash may be used in Chrome extensions by either creating a `lodash csp`
   * build and avoiding `_.template` use, or loading Lo-Dash in a sandboxed page.
   * See http://developer.chrome.com/trunk/extensions/sandboxingEval.html
   *
   * @static
   * @memberOf _
   * @category Utilities
   * @param {String} text The template text.
   * @param {Obect} data The data object used to populate the text.
   * @param {Object} options The options object.
   *  escape - The "escape" delimiter regexp.
   *  evaluate - The "evaluate" delimiter regexp.
   *  interpolate - The "interpolate" delimiter regexp.
   *  sourceURL - The sourceURL of the template's compiled source.
   *  variable - The data object variable name.
   *
   * @returns {Function|String} Returns a compiled function when no `data` object
   *  is given, else it returns the interpolated text.
   * @example
   *
   * // using a compiled template
   * var compiled = _.template('hello <%= name %>');
   * compiled({ 'name': 'moe' });
   * // => 'hello moe'
   *
   * var list = '<% _.forEach(people, function(name) { %><li><%= name %></li><% }); %>';
   * _.template(list, { 'people': ['moe', 'larry', 'curly'] });
   * // => '<li>moe</li><li>larry</li><li>curly</li>'
   *
   * // using the "escape" delimiter to escape HTML in data property values
   * _.template('<b><%- value %></b>', { 'value': '<script>' });
   * // => '<b>&lt;script&gt;</b>'
   *
   * // using the ES6 delimiter as an alternative to the default "interpolate" delimiter
   * _.template('hello ${ name }', { 'name': 'curly' });
   * // => 'hello curly'
   *
   * // using the internal `print` function in "evaluate" delimiters
   * _.template('<% print("hello " + epithet); %>!', { 'epithet': 'stooge' });
   * // => 'hello stooge!'
   *
   * // using custom template delimiters
   * _.templateSettings = {
   *   'interpolate': /{{([\s\S]+?)}}/g
   * };
   *
   * _.template('hello {{ name }}!', { 'name': 'mustache' });
   * // => 'hello mustache!'
   *
   * // using the `sourceURL` option to specify a custom sourceURL for the template
   * var compiled = _.template('hello <%= name %>', null, { 'sourceURL': '/basic/greeting.jst' });
   * compiled(data);
   * // => find the source of "greeting.jst" under the Sources tab or Resources panel of the web inspector
   *
   * // using the `variable` option to ensure a with-statement isn't used in the compiled template
   * var compiled = _.template('hello <%= data.name %>!', null, { 'variable': 'data' });
   * compiled.source;
   * // => function(data) {
   *   var __t, __p = '', __e = _.escape;
   *   __p += 'hello ' + ((__t = ( data.name )) == null ? '' : __t) + '!';
   *   return __p;
   * }
   *
   * // using the `source` property to inline compiled templates for meaningful
   * // line numbers in error messages and a stack trace
   * fs.writeFileSync(path.join(cwd, 'jst.js'), '\
   *   var JST = {\
   *     "main": ' + _.template(mainText).source + '\
   *   };\
   * ');
   */
  function template(text, data, options) {
    // based on John Resig's `tmpl` implementation
    // http://ejohn.org/blog/javascript-micro-templating/
    // and Laura Doktorova's doT.js
    // https://github.com/olado/doT
    text || (text = '');
    options || (options = {});

    var isEvaluating,
        result,
        settings = lodash.templateSettings,
        index = 0,
        interpolate = options.interpolate || settings.interpolate || reNoMatch,
        source = "__p += '",
        variable = options.variable || settings.variable,
        hasVariable = variable;

    // compile regexp to match each delimiter
    var reDelimiters = RegExp(
      (options.escape || settings.escape || reNoMatch).source + '|' +
      interpolate.source + '|' +
      (interpolate === reInterpolate ? reEsTemplate : reNoMatch).source + '|' +
      (options.evaluate || settings.evaluate || reNoMatch).source + '|$'
    , 'g');

    text.replace(reDelimiters, function(match, escapeValue, interpolateValue, esTemplateValue, evaluateValue, offset) {
      interpolateValue || (interpolateValue = esTemplateValue);

      // escape characters that cannot be included in string literals
      source += text.slice(index, offset).replace(reUnescapedString, escapeStringChar);

      // replace delimiters with snippets
      source +=
        escapeValue ? "' +\n__e(" + escapeValue + ") +\n'" :
        evaluateValue ? "';\n" + evaluateValue + ";\n__p += '" :
        interpolateValue ? "' +\n((__t = (" + interpolateValue + ")) == null ? '' : __t) +\n'" : '';

      isEvaluating || (isEvaluating = evaluateValue || reComplexDelimiter.test(escapeValue || interpolateValue));
      index = offset + match.length;
    });

    source += "';\n";

    // if `variable` is not specified and the template contains "evaluate"
    // delimiters, wrap a with-statement around the generated code to add the
    // data object to the top of the scope chain
    if (!hasVariable) {
      variable = 'obj';
      if (isEvaluating) {
        source = 'with (' + variable + ') {\n' + source + '\n}\n';
      }
      else {
        // avoid a with-statement by prepending data object references to property names
        var reDoubleVariable = RegExp('(\\(\\s*)' + variable + '\\.' + variable + '\\b', 'g');
        source = source
          .replace(reInsertVariable, '$&' + variable + '.')
          .replace(reDoubleVariable, '$1__d');
      }
    }

    // cleanup code by stripping empty strings
    source = (isEvaluating ? source.replace(reEmptyStringLeading, '') : source)
      .replace(reEmptyStringMiddle, '$1')
      .replace(reEmptyStringTrailing, '$1;');

    // frame code as the function body
    source = 'function(' + variable + ') {\n' +
      (hasVariable ? '' : variable + ' || (' + variable + ' = {});\n') +
      'var __t, __p = \'\', __e = _.escape' +
      (isEvaluating
        ? ', __j = Array.prototype.join;\n' +
          'function print() { __p += __j.call(arguments, \'\') }\n'
        : (hasVariable ? '' : ', __d = ' + variable + '.' + variable + ' || ' + variable) + ';\n'
      ) +
      source +
      'return __p\n}';

    // use a sourceURL for easier debugging
    // http://www.html5rocks.com/en/tutorials/developertools/sourcemaps/#toc-sourceurl
    var sourceURL = useSourceURL
      ? '\n//@ sourceURL=' + (options.sourceURL || '/lodash/template/source[' + (templateCounter++) + ']')
      : '';

    try {
      result = Function('_', 'return ' + source + sourceURL)(lodash);
    } catch(e) {
      e.source = source;
      throw e;
    }

    if (data) {
      return result(data);
    }
    // provide the compiled function's source via its `toString` method, in
    // supported environments, or the `source` property as a convenience for
    // inlining compiled templates during the build process
    result.source = source;
    return result;
  }

  /**
   * Executes the `callback` function `n` times, returning an array of the results
   * of each `callback` execution. The `callback` is bound to `thisArg` and invoked
   * with one argument; (index).
   *
   * @static
   * @memberOf _
   * @category Utilities
   * @param {Number} n The number of times to execute the callback.
   * @param {Function} callback The function called per iteration.
   * @param {Mixed} [thisArg] The `this` binding of `callback`.
   * @returns {Array} Returns a new array of the results of each `callback` execution.
   * @example
   *
   * var diceRolls = _.times(3, _.partial(_.random, 1, 6));
   * // => [3, 6, 4]
   *
   * _.times(3, function(n) { mage.castSpell(n); });
   * // => calls `mage.castSpell(n)` three times, passing `n` of `0`, `1`, and `2` respectively
   *
   * _.times(3, function(n) { this.cast(n); }, mage);
   * // => also calls `mage.castSpell(n)` three times
   */
  function times(n, callback, thisArg) {
    n = +n || 0;
    var index = -1,
        result = Array(n);

    while (++index < n) {
      result[index] = callback.call(thisArg, index);
    }
    return result;
  }

  /**
   * The opposite of `_.escape`, this method converts the HTML entities
   * `&amp;`, `&lt;`, `&gt;`, `&quot;`, and `&#x27;` in `string` to their
   * corresponding characters.
   *
   * @static
   * @memberOf _
   * @category Utilities
   * @param {String} string The string to unescape.
   * @returns {String} Returns the unescaped string.
   * @example
   *
   * _.unescape('Moe, Larry &amp; Curly');
   * // => "Moe, Larry & Curly"
   */
  function unescape(string) {
    return string == null ? '' : (string + '').replace(reEscapedHtml, unescapeHtmlChar);
  }

  /**
   * Generates a unique id. If `prefix` is passed, the id will be appended to it.
   *
   * @static
   * @memberOf _
   * @category Utilities
   * @param {String} [prefix] The value to prefix the id with.
   * @returns {Number|String} Returns a numeric id if no prefix is passed, else
   *  a string id may be returned.
   * @example
   *
   * _.uniqueId('contact_');
   * // => 'contact_104'
   */
  function uniqueId(prefix) {
    var id = idCounter++;
    return prefix ? prefix + id : id;
  }

  /*--------------------------------------------------------------------------*/

  /**
   * Wraps the value in a `lodash` wrapper object.
   *
   * @static
   * @memberOf _
   * @category Chaining
   * @param {Mixed} value The value to wrap.
   * @returns {Object} Returns the wrapper object.
   * @example
   *
   * var stooges = [
   *   { 'name': 'moe', 'age': 40 },
   *   { 'name': 'larry', 'age': 50 },
   *   { 'name': 'curly', 'age': 60 }
   * ];
   *
   * var youngest = _.chain(stooges)
   *     .sortBy(function(stooge) { return stooge.age; })
   *     .map(function(stooge) { return stooge.name + ' is ' + stooge.age; })
   *     .first()
   *     .value();
   * // => 'moe is 40'
   */
  function chain(value) {
    value = new lodash(value);
    value.__chain__ = true;
    return value;
  }

  /**
   * Invokes `interceptor` with the `value` as the first argument, and then
   * returns `value`. The purpose of this method is to "tap into" a method chain,
   * in order to perform operations on intermediate results within the chain.
   *
   * @static
   * @memberOf _
   * @category Chaining
   * @param {Mixed} value The value to pass to `interceptor`.
   * @param {Function} interceptor The function to invoke.
   * @returns {Mixed} Returns `value`.
   * @example
   *
   * _.chain([1, 2, 3, 200])
   *  .filter(function(num) { return num % 2 == 0; })
   *  .tap(alert)
   *  .map(function(num) { return num * num })
   *  .value();
   * // => // [2, 200] (alerted)
   * // => [4, 40000]
   */
  function tap(value, interceptor) {
    interceptor(value);
    return value;
  }

  /**
   * Enables method chaining on the wrapper object.
   *
   * @name chain
   * @deprecated
   * @memberOf _
   * @category Chaining
   * @returns {Mixed} Returns the wrapper object.
   * @example
   *
   * _([1, 2, 3]).value();
   * // => [1, 2, 3]
   */
  function wrapperChain() {
    this.__chain__ = true;
    return this;
  }

  /**
   * Extracts the wrapped value.
   *
   * @name value
   * @memberOf _
   * @category Chaining
   * @returns {Mixed} Returns the wrapped value.
   * @example
   *
   * _([1, 2, 3]).value();
   * // => [1, 2, 3]
   */
  function wrapperValue() {
    return this.__wrapped__;
  }

  /*--------------------------------------------------------------------------*/

  /**
   * The semantic version number.
   *
   * @static
   * @memberOf _
   * @type String
   */
  lodash.VERSION = '0.10.0';

  // assign static methods
  lodash.assign = assign;
  lodash.after = after;
  lodash.bind = bind;
  lodash.bindAll = bindAll;
  lodash.bindKey = bindKey;
  lodash.chain = chain;
  lodash.clone = clone;
  lodash.compact = compact;
  lodash.compose = compose;
  lodash.contains = contains;
  lodash.countBy = countBy;
  lodash.debounce = debounce;
  lodash.defaults = defaults;
  lodash.defer = defer;
  lodash.delay = delay;
  lodash.difference = difference;
  lodash.escape = escape;
  lodash.every = every;
  lodash.filter = filter;
  lodash.find = find;
  lodash.first = first;
  lodash.flatten = flatten;
  lodash.forEach = forEach;
  lodash.forIn = forIn;
  lodash.forOwn = forOwn;
  lodash.functions = functions;
  lodash.groupBy = groupBy;
  lodash.has = has;
  lodash.identity = identity;
  lodash.indexOf = indexOf;
  lodash.initial = initial;
  lodash.intersection = intersection;
  lodash.invert = invert;
  lodash.invoke = invoke;
  lodash.isArguments = isArguments;
  lodash.isArray = isArray;
  lodash.isBoolean = isBoolean;
  lodash.isDate = isDate;
  lodash.isElement = isElement;
  lodash.isEmpty = isEmpty;
  lodash.isEqual = isEqual;
  lodash.isFinite = isFinite;
  lodash.isFunction = isFunction;
  lodash.isNaN = isNaN;
  lodash.isNull = isNull;
  lodash.isNumber = isNumber;
  lodash.isObject = isObject;
  lodash.isPlainObject = isPlainObject;
  lodash.isRegExp = isRegExp;
  lodash.isString = isString;
  lodash.isUndefined = isUndefined;
  lodash.keys = keys;
  lodash.last = last;
  lodash.lastIndexOf = lastIndexOf;
  lodash.map = map;
  lodash.max = max;
  lodash.memoize = memoize;
  lodash.merge = merge;
  lodash.min = min;
  lodash.mixin = mixin;
  lodash.noConflict = noConflict;
  lodash.object = object;
  lodash.omit = omit;
  lodash.once = once;
  lodash.pairs = pairs;
  lodash.partial = partial;
  lodash.pick = pick;
  lodash.pluck = pluck;
  lodash.random = random;
  lodash.range = range;
  lodash.reduce = reduce;
  lodash.reduceRight = reduceRight;
  lodash.reject = reject;
  lodash.rest = rest;
  lodash.result = result;
  lodash.shuffle = shuffle;
  lodash.size = size;
  lodash.some = some;
  lodash.sortBy = sortBy;
  lodash.sortedIndex = sortedIndex;
  lodash.tap = tap;
  lodash.template = template;
  lodash.throttle = throttle;
  lodash.times = times;
  lodash.toArray = toArray;
  lodash.unescape = unescape;
  lodash.union = union;
  lodash.uniq = uniq;
  lodash.uniqueId = uniqueId;
  lodash.values = values;
  lodash.where = where;
  lodash.without = without;
  lodash.wrap = wrap;
  lodash.zip = zip;

  // assign aliases
  lodash.all = every;
  lodash.any = some;
  lodash.collect = map;
  lodash.detect = find;
  lodash.drop = rest;
  lodash.each = forEach;
  lodash.extend = assign;
  lodash.foldl = reduce;
  lodash.foldr = reduceRight;
  lodash.head = first;
  lodash.include = contains;
  lodash.inject = reduce;
  lodash.methods = functions;
  lodash.select = filter;
  lodash.tail = rest;
  lodash.take = first;
  lodash.unique = uniq;

  // add pseudo private property to be used and removed during the build process
  lodash._iteratorTemplate = iteratorTemplate;

  /*--------------------------------------------------------------------------*/

  // add all static functions to `lodash.prototype`
  mixin(lodash);

  // add `lodash.prototype.chain` after calling `mixin()` to avoid overwriting
  // it with the wrapped `lodash.chain`
  lodash.prototype.chain = wrapperChain;
  lodash.prototype.value = wrapperValue;

  // add all mutator Array functions to the wrapper.
  forEach(['pop', 'push', 'reverse', 'shift', 'sort', 'splice', 'unshift'], function(methodName) {
    var func = arrayRef[methodName];

    lodash.prototype[methodName] = function() {
      var value = this.__wrapped__;
      func.apply(value, arguments);

      // avoid array-like object bugs with `Array#shift` and `Array#splice` in
      // Firefox < 10 and IE < 9
      if (hasObjectSpliceBug && value.length === 0) {
        delete value[0];
      }
      if (this.__chain__) {
        value = new lodash(value);
        value.__chain__ = true;
      }
      return value;
    };
  });

  // add all accessor Array functions to the wrapper.
  forEach(['concat', 'join', 'slice'], function(methodName) {
    var func = arrayRef[methodName];

    lodash.prototype[methodName] = function() {
      var value = this.__wrapped__,
          result = func.apply(value, arguments);

      if (this.__chain__) {
        result = new lodash(result);
        result.__chain__ = true;
      }
      return result;
    };
  });

  /*--------------------------------------------------------------------------*/

  // expose Lo-Dash
  // some AMD build optimizers, like r.js, check for specific condition patterns like the following:
  if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
    // Expose Lo-Dash to the global object even when an AMD loader is present in
    // case Lo-Dash was injected by a third-party script and not intended to be
    // loaded as a module. The global assignment can be reverted in the Lo-Dash
    // module via its `noConflict()` method.
    window._ = lodash;

    // define as an anonymous module so, through path mapping, it can be
    // referenced as the "underscore" module
    define(function() {
      return lodash;
    });
  }
  // check for `exports` after `define` in case a build optimizer adds an `exports` object
  else if (freeExports) {
    // in Node.js or RingoJS v0.8.0+
    if (typeof module == 'object' && module && module.exports == freeExports) {
      (module.exports = lodash)._ = lodash;
    }
    // in Narwhal or RingoJS v0.7.0-
    else {
      freeExports._ = lodash;
    }
  }
  else {
    // in a browser or Rhino
    window._ = lodash;
  }
}(this));

});

require.define("/client.js",function(require,module,exports,__dirname,__filename,process,global){var shoe = require('shoe');
var domready = require('domready');
var _ = require('lodash');

domready(function(){
  var stream = shoe('/shoe');

  stream.on('connection', function(data) {
    console.log("Connected");
  });

  var counter = 10;
  var results = [];
  stream.on('data', function(data) {
    if (counter > 0) {
      stream.write(createMessage(counter));
      results.push(JSON.parse(data));
      counter -= 1;
    } else {
      stream.end();
    }

  });

  stream.on('end', function(data) {
    console.log("Closed connnection", results);
  });

  var createMessage = function(type) {
    var obj = {
      type: type,
      time: Date.now()
    };
    return JSON.stringify(obj);
  };

});
});
require("/client.js");
})();
