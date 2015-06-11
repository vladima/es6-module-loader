/*
 * Traceur, Babel and TypeScript transpile hook for Loader
 */
var transpile = (function() {

  // use Traceur by default
  Loader.prototype.transpiler = 'traceur';

  function transpile(load) {
    var self = this;

    // pick up Transpiler modules from existing globals on first run if set
    if (!self.transpilerHasRun) {
      if (g.traceur && !self.has('traceur'))
        self.set('traceur', getTranspilerModule(self, 'traceur'));
      if (g.babel && !self.has('babel'))
        self.set('babel', getTranspilerModule(self, 'babel'));
      if (g.ts && !self.has('typescript'))
        self.set('typescript', getTranspilerModule(self, 'ts'));
      self.transpilerHasRun = true;
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
    var self = this;
    return Promise.resolve(self.normalize(self.transpiler))
    .then(function(transpilerNormalized) {
      // load transpiler as a global (avoiding System clobbering)
      if (load.address === transpilerNormalized) {
        return {
          deps: [],
          execute: function() {
            var curSystem = __global.System;
            var curLoader = __global.Reflect.Loader;
            // ensure not detected as CommonJS
            __eval('(function(require,exports,module){' + load.source + '})();', load.address, __global);
            __global.System = curSystem;
            __global.Reflect.Loader = curLoader;
            return self.newModule({ 'default': __global[self.transpiler], __useDefault: true });
          }
        };
      }
    });
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

    return doTraceurCompile(load.source, compiler, options.filename);
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

    return babel.transform(load.source, options).code;
  }
  
  function typescriptTranspile(load, ts) {
    var options = { module: ts.ModuleKind.System, target: ts.ScriptTarget.ES5, emitDecoratorMetadata: true };
    var source = ts.transpile(load.source, options);
    return source + '\n//# sourceURL=' + load.address + '!eval';;
  }
})(__global.LoaderPolyfill);
