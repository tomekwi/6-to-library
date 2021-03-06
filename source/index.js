// Imports
// -------------------------------------------------------------------------------------------------

var nodeUtil = require('util');

var pluck = require('101/pluck');
var AMDFormatter = require('6to5/lib/6to5/transformation/modules/amd');
var t = require('6to5/lib/6to5/types');
var util = require('6to5/lib/6to5/util');
var asArray = require('as/array');
var basename = require('basename');

var template = require('./template');


// Main
// -------------------------------------------------------------------------------------------------

// Extend AMDFormatter.
var self = function SixToLibrary () {
  AMDFormatter.apply(this, arguments);
  this.globalExportId = t.toIdentifier(basename(this.file.opts.filename));
  this.globalIds = {};

  // Remove the module-wide "use strict" statement.
  this.file.transformers = this.file.transformers.filter(function (transformer) {
    return (transformer.key != 'useStrict');
    });
  };
util.inherits(self, AMDFormatter);

// Override the method `transform`.
self.prototype.transform = function (ast) {
  var moduleName;
  var program = ast.program;
  var rawGlobalIds = this.globalIds;

  // Parse module names.
  var ids = asArray(this.ids);
  var globalIds = ids.map(function (id) {
    var globalId = rawGlobalIds[id.key];
    if (!globalId) throw new Error ('No specifier found for the id "' + id.key + '".');
    return globalId;
    });
  var importLocations = ids.map(function (id) {
    return t.literal(id.key);
    });

  // Create the factory.
  var factory = t.functionExpression
    ( null
    , [t.identifier('exports')].concat(ids.map(pluck('value')))
    , t.blockStatement(
        [].concat(t.literal('use strict'))
          .concat(program.body)
        )
    );

  // Create the runner.
  var runner = template('runner-body',
    { AMD_ARGUMENTS: [t.arrayExpression(
        [].concat( (moduleName = this.getModuleName())
                 ? t.literal(moduleName)
                 : []
                 )
          .concat(t.literal('exports'))
          .concat(importLocations)
        )]
    , COMMON_ARGUMENTS: importLocations.map(function (name) {
        return t.callExpression(t.identifier('require'), [name]);
        })
    , GLOBAL_EXPORTS: [template('global-exports',
        { EXPORTS_NAMESPACE: t.identifier(this.globalExportId)
        })]
    , GLOBAL_IMPORTS: globalIds
    , GLOBAL_EXPORTS_NAME: t.literal(this.globalExportId)
    });

  // Finish off.
  var call = t.callExpression(runner, [t.thisExpression(), factory]);
  program.body = [t.expressionStatement(call)];
  };


// Override the method `importDeclaration`.
self.prototype.importDeclaration = function (declaration) {
  // Add the import's specifier.
  this._pushGlobalIdentifier(declaration);

  // Apply the super method.
  AMDFormatter.prototype.importDeclaration.apply(this, arguments);
  };


// Override the method `importSpecifier`.
self.prototype.importSpecifier = function (specifier, declaration) {
  // Add the import's specifier.
  this._pushGlobalIdentifier(declaration, specifier);

  // Apply the super method.
  AMDFormatter.prototype.importSpecifier.apply(this, arguments);
  };


// Override the method `exportSpecifier`.
self.prototype.exportSpecifier = function (specifier, declaration) {
  // Add the export's specifier.
  this._pushGlobalIdentifier(declaration, specifier);

  // Apply the super method.
  AMDFormatter.prototype.exportSpecifier.apply(this, arguments);
  };


self.prototype._pushGlobalIdentifier = function (declaration, specifier) {
  var name = declaration.source && declaration.source.value;
  var identifier = t.toIdentifier
    (  specifier && specifier.default !== false && specifier.name && specifier.name.name
    || specifier && specifier.type == "ExportSpecifier" && specifier.id && specifier.id.name
    || basename(name)
    || null
    );
  if (identifier === null) throw new Error
    ( "Unable to resolve global identifier "
    + "for the declaration:\n" + nodeUtil.inspect(declaration) + "\n"
    + "and specifier:\n" + nodeUtil.inspect(specifier) + "."
    );

  var ids = this.globalIds;

  if (!ids[name]) ids[name] = template("global-import",
    { IMPORT_IDENTIFIER: t.identifier(identifier)
    });
  return ids[name];
  };


// Export
// -------------------------------------------------------------------------------------------------

module.exports = self;
