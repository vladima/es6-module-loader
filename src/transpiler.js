/*
 * Traceur and Babel transpile hook for Loader
 */
(function(Loader) {
  var g = __global;

  function getTranspilerModule(loader, globalName) {
    return loader.newModule({ 'default': g[globalName], __useDefault: true });
  }
  var firstRun = true;

  // use Traceur by default
  Loader.prototype.transpiler = 'traceur';

  Loader.prototype.transpile = function(load) {
    var self = this;

    // pick up Transpiler modules from existing globals on first run if set
    if (firstRun) {
      if (g.traceur && !self.has('traceur'))
        self.set('traceur', getTranspilerModule(self, 'traceur'));
      if (g.babel && !self.has('babel'))
        self.set('babel', getTranspilerModule(self, 'babel'));
      if (g.ts && !self.has('typescript'))
        self.set('typescript', getTranspilerModule(self, 'ts'));

      firstRun = false;
    }
    
    return self['import'](self.transpiler).then(function(transpiler) {
      if (transpiler.__useDefault)
        transpiler = transpiler['default'];

      var transpileFunction;
      if (transpiler.Compiler) {
        transpileFunction = traceurTranspile;
      }
      else if (transpiler.createLanguageService) {
        transpileFunction = typescriptTranspile;
      }
      else {
        transpileFunction = babelTranspile;
      }
      return address = 'var __moduleAddress = "' + load.address + '";' + transpileFunction.call(self, load, transpiler);
    });
  };

  Loader.prototype.instantiate = function(load) {
    // load transpiler as a global (avoiding System clobbering)
    if (load.name === this.transpiler) {      
      var self = this;
      return {
        deps: [],
        execute: function() {
          var curSystem = g.System;
          var curLoader = g.Reflect.Loader;
          __eval('(function(require,exports,module){' + load.source + '})();', g, load);
          g.System = curSystem;
          g.Reflect.Loader = curLoader;
          return getTranspilerModule(self, load.name);
        }
      };
    }
  };

  function traceurTranspile(load, traceur) {
    var options = this.traceurOptions || {};
    options.modules = 'instantiate';
    options.script = false;
    options.sourceMaps = 'inline';
    options.filename = load.address;
    options.inputSourceMap = load.metadata.sourceMap;
    options.moduleName = false;

    var compiler = new traceur.Compiler(options);
    var source = doTraceurCompile(load.source, compiler, options.filename);

    // add "!eval" to end of Traceur sourceURL
    // I believe this does something?
    source += '!eval';

    return source;
  }
  function doTraceurCompile(source, compiler, filename) {
    try {
      return compiler.compile(source, filename);
    }
    catch(e) {
      // traceur throws an error array
      throw e[0];
    }
  }

  function babelTranspile(load, babel) {
    var options = this.babelOptions || {};
    options.modules = 'system';
    options.sourceMap = 'inline';
    options.filename = load.address;
    options.code = true;
    options.ast = false;
    
    if (!options.blacklist)
      options.blacklist = ['react'];

    var source = babel.transform(load.source, options).code;

    // add "!eval" to end of Babel sourceURL
    // I believe this does something?
    return source + '\n//# sourceURL=' + load.address + '!eval';
  }
  
  function typescriptTranspile(load, ts) {
    var options = { module: ts.ModuleKind.AMD, target: ts.ScriptTarget.ES5 };
    var source = ts.transpile(load.source, options);
    return "(function () { var define =" + define.toString() + ";\n" + source + "\n })()" + '\n//# sourceURL=' + load.address + '!eval';

    function define(dependencyNames, module) {
      return System.register(dependencyNames.slice(2), function ($__export) {
        var exports = {};
        var imports = [{}, exports];
        var setters = [];
        for (var i = 0; i < dependencyNames.length - 2; ++i) {
          setters.push(
            (function (i) { return function (value) { imports[i + 2] = value; } })(i)
          );
        }
        return {
          setters: setters,
          execute: function () {
            module.apply(undefined, imports);
            for (var n in exports) {
              $__export(n, exports[n]);
            }
          }
        }
      });
    }
  }
})(__global.LoaderPolyfill);