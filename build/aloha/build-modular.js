(function () {
	'use strict';

	// Depends on global fs object provided by requirejs which is
	// equivalent to the following nodejs code (which doesn't work here
	// for some reason).
	//var fs = require('fs');

	var devMode = -1 !== process.argv.indexOf('alohaBuildForDevMode=true');

	var appDir = "../../src/";

	// This list is the same as in util/aloha-define-plugin.js
	var alohaPlugins = [
		'common/ui',
		'common/link',
		'common/table',
		'common/list',
		'common/image',
		'common/highlighteditables',
		'common/format',
		'common/dom-to-xhtml',
		'common/contenthandler',
		'common/characterpicker',
		'common/commands',
		'common/align',
		'common/abbr',
		'common/block',
		'common/horizontalruler',
		'common/undo',
		'common/paste',
		'extra/cite',
		'extra/flag-icons',
		'extra/numerated-headers',
		'extra/formatlesspaste',
		'extra/linkbrowser',
		'extra/imagebrowser',
		'extra/ribbon',
		'extra/toc',
		'extra/wai-lang',
		'extra/headerids',
		'extra/metaview',
		'extra/listenforcer'
	];

	var paths = {
		// These paths are the same setup as in aloha.js.

		// We don't include Aloha's patched jquery by default, the user
		// should do it himself.
		'jquery': 'empty:',
    	//'jquery': 'vendor/jquery-1.7.2',

		// We don't include jquery-ui either, the user should do it himself.
		'jqueryui': 'empty:',
		//'jqueryui': 'vendor/jquery-ui-1.9m6',

		// For the repository browser
		'PubSub': 'vendor/pubsub/js/pubsub-unminified',
		'Class': 'vendor/class',
		'RepositoryBrowser': 'vendor/repository-browser/js/repository-browser-unminified',
		'jstree': 'vendor/jquery.jstree',              // Mutates jquery
		'jqgrid': 'vendor/jquery.jqgrid',              // Mutates jquery
		'jquery-layout': 'vendor/jquery.layout',     // Mutates jquery
		'jqgrid-locale-en': 'vendor/grid.locale.en', // Mutates jqgrid
		'jqgrid-locale-de': 'vendor/grid.locale.de', // Mutates jqgrid
		'repository-browser-i18n-de': 'vendor/repository-browser/js/repository-browser-unminified',
		'repository-browser-i18n-en': 'vendor/repository-browser/js/repository-browser-unminified',
	};

	var modules = [];

	var additionalIncludes = {
		'common/block': [
			'block/block-plugin',
			'block/editor',
			'block/sidebarattributeeditor',
			'block/blockcontenthandler',
		],
		'common/ui': [
			'ui/ui-plugin',
			'ui/ui',
			'ui/arena',
			'ui/autocomplete',
			'ui/dialog',
			'ui/menuButton',
			'ui/multiSplit',
			'ui/port-helper-attribute-field',
			'ui/port-helper-multi-split',
			'ui/text',
			'ui/toggleButton',
		],
		'common/contenthandler': [
			'contenthandler/vendor/sanitize'
		]
	};

	var coreIncludes = [
		// Rrequirejs i18n loader plugin.
		'i18n',
		'aloha',
		'vendor/class',
		'vendor/pubsub/js/pubsub',
		'vendor/amplify.store'
	];

	// Because aloha should work without having to worry about including
	// i18n files, a default language should be included. Since the root
	// i18n file is alread in english (and the root file has to be
	// included otherwise nothing works), we also load the en specific
	// i18n files by default (which are very few - only block and align
	// plugin have separate en specific files).
	// This must be the same here and in aloha.js.
	var defaultLocale = 'en';

	/**
	 * This onBuildWrite implementation implements the
	 * alohaBuildForDevMode, alohaExclusive, alohaExclude directives. If
	 * non of these are specified, will just return the unmodified
	 * contents.
	 *
	 * alohaBuildForDevMode: true,
	 * If true, will output document.write(...) directives such that the
	 * original unconcatenated files are loaded, so they can be
	 * debugged.
	 *
	 * alohaExclusive: "path/to/dir",
	 * If set, only files under this path will be included in the
	 * optimized output file. Other dependencies will simply be skipped.
	 *
	 * alohaExclude: "path/to/dir",
	 * If set, any files in under this path will be excluded.
	 */
	function onBuildWrite(moduleName, path, contents) {
		// relativize("a/b/c/", "a/b/c/d/" ) => "d"
		// relativize("a/b/c" , "a/b/c/d/e") => "d/e"
		function relativize(ancestor, descendant) {
			ancestor = ancestor.replace(/\/$/, '');
			descendant = descendant.replace(/\/$/, '');
			if (ancestor + '/' !== descendant.substring(0, ancestor.length + 1)) {
				throw "Expected `" + ancestor + "' to be a ancestor of `" + descendant + "'";
			}
			return descendant.substring(ancestor.length + 1);
		}

		// The output folder is a common ancestor of all paths
		var outputDir = this.dir.replace(/\/$/, '');
		var relFromOutputDir = relativize(outputDir, path);

		if (this.alohaExclusive && this.alohaExclusive + "/" !== relFromOutputDir.substring(0, this.alohaExclusive.length + 1)) {
			// Because this module is excluded via the alohaExlusive
			// directive and must not be concatenated into the currently
			// optimized module.
			return '';
		}
		if (this.alohaBuildForDevMode) {
			// Because during dev mode we don't want to concatenate
			// modules, but instead load them from the original
			// location.
			// The global define variable will be restored by
			// aloha-define-restore.js.
			return 'define = window.Aloha.define;'
				+ 'document.write(\'<script data-gg-define="' + moduleName + '" src="\' + ALOHA_BASE_URL + \'' + relFromOutputDir + '"></script>\');';
		}
		if (this.alohaNamespace) {
			// requirejs has a feature called 'namespace' which does too
			// much however since it would also namespace global
			// variables, but we only want to namespace defines.
			return contents.replace(/^(\s*)define\(/m, '$1Aloha.define(');
		}
		// Because, unless this module is excluded or dev mode is on,
		// both of which are handled above, no special handling is
		// necessary.
		return contents;
	}

	function includeI18nIfExists(module, path, prefix, includes) {
		// __dirname is equal to the folder r.js resides in.
		var i18nDir = __dirname + '/aloha/' + appDir + 'lib/' + prefix;
		// Because if we include non-existing files, r.js will throw an error.
		if (fs.existsSync(i18nDir + path + '.js')) {
			includes.push(module + path);
		}
	}

	function eachPlugin(fn) {
		for (var i = 0; i < alohaPlugins.length; i++) {
			var parts = alohaPlugins[i].split('/');
			var bundle = parts[0];
			var plugin = parts[1];
			var prefix = '../plugins/' + bundle + '/' + plugin;
			fn(plugin, bundle, prefix);
		}
	}

	// Because aloha has shortcut paths for every plugin.
	eachPlugin(function (plugin, bundle, prefix) {
		paths[plugin] = prefix + '/lib';
		paths[plugin + '/nls'] = prefix + '/nls';
		paths[plugin + '/res'] = prefix + '/res';
		paths[plugin + '/css'] = prefix + '/css';
		paths[plugin + '/vendor'] = prefix + '/vendor';
	});


	// Almond provides the require() implementation and enough of the
	// requirejs API to load loader plugins like the i18n plugin.
	// aloha-define-plugin.js provides plugin autoload functionality.
	var defineIncludes = ['vendor/almond', 'aloha-define-plugin'];
	if (devMode) {
		// gg-define-anon provides a wrapper that names anonymous modules.
		// Because requirejs will name modules during compilation,
		// this is only required in dev mode.
		defineIncludes.push('vendor/gg-define-anon');
	}
	// aloha-define.js provides Aloha.define.
	defineIncludes.push('aloha-define');
	coreIncludes = defineIncludes.concat(coreIncludes);

	// Because we want to ensure that the root and the default locale
	// specific files are included.
	includeI18nIfExists('aloha', '/nls/i18n', 'aloha', coreIncludes);
	includeI18nIfExists('aloha', '/nls/' + defaultLocale + '/i18n', 'aloha', coreIncludes);

	var closureStartFrag;
	var closureEndFrag;
	if (devMode) {
		// Because almondjs clobbers some global variables, we have to
		// preserve them. In producation mode we achieve that with a
		// closure, in dev mode we need some additional code.
		closureStartFrag = 'closure-start-preserve-define.frag';
		closureEndFrag = 'closure-end-restore-define.frag';
	} else {
		closureStartFrag = 'closure-start.frag';
		closureEndFrag = 'closure-end.frag';
	}

	// Build the core module and core i18n modules.
    modules.push({
		name: 'aloha-core',
		create: true,
		override: {
			alohaExclusive: 'lib',
			alohaNamespace: true,
		},
		include: coreIncludes,
	});

	// Build a plugin module and i18n modules for each plugin.
	eachPlugin(function (plugin, bundle, prefix) {
		var includes = [plugin + '/' + plugin + '-plugin'];
		var incl = additionalIncludes[bundle + '/' + plugin];
		if (incl) {
			includes = includes.concat(incl);
		}
		includeI18nIfExists(plugin, '/nls/i18n', prefix, includes);
		includeI18nIfExists(plugin, '/nls/' + defaultLocale + '/i18n', prefix, includes);
		modules.push({
			name: prefix + '/' + plugin,
			create: true,
			override: {
				alohaExclusive: 'plugins/' + bundle + '/' + plugin,
				alohaNamespace: true,
			},
			include: includes
		});
	});

	return {
    //The top level directory that contains your app. If this option is used
    //then it assumed your scripts are in a subdirectory under this path.
    //This option is not required. If it is not specified, then baseUrl
    //below is the anchor point for finding things. If this option is specified,
    //then all the files from the app directory will be copied to the dir:
    //output area, and baseUrl will assume to be a relative path under
    //this directory.
    appDir: appDir,

    //By default, all modules are located relative to this path. If baseUrl
    //is not explicitly set, then all modules are loaded relative to
    //the directory that holds the build file. If appDir is set, then
    //baseUrl should be specified as relative to the appDir.
    baseUrl: "lib/",

    //Set paths for modules. If relative paths, set relative to baseUrl above.
    //If a special value of "empty:" is used for the path value, then that
    //acts like mapping the path to an empty file. It allows the optimizer to
    //resolve the dependency to path, but then does not include it in the output.
    //Useful to map module names that are to resources on a CDN or other
    //http: URL when running in the browser and during an optimization that
    //file should be skipped because it has no dependencies.
	paths: paths,

    //The directory path to save the output. If not specified, then
    //the path will default to be a directory called "build" as a sibling
    //to the build file. All relative paths are relative to the build file.
    dir: "../../target/build-modular",

    //As of RequireJS 2.0.2, the dir above will be deleted before the
    //build starts again. If you have a big build and are not doing
    //source transforms with onBuildRead/onBuildWrite, then you can
    //set keepBuildDir to true to keep the previous dir. This allows for
    //faster rebuilds, but it could lead to unexpected errors if the
    //built code is transformed in some way.
    keepBuildDir: true,

    //Used to inline i18n resources into the built file. If no locale
    //is specified, i18n resources will not be inlined. Only one locale
    //can be inlined for a build. Root bundles referenced by a build layer
    //will be included in a build layer regardless of locale being set.
    //locale: "en-us",

    //How to optimize all the JS files in the build output directory.
    //Right now only the following values
    //are supported:
    //- "uglify": (default) uses UglifyJS to minify the code.
    //- "closure": uses Google's Closure Compiler in simple optimization
    //mode to minify the code. Only available if running the optimizer using
    //Java.
    //- "closure.keepLines": Same as closure option, but keeps line returns
    //in the minified files.
    //- "none": no minification will be done.
    optimize: "none",

    //If using UglifyJS for script optimization, these config options can be
    //used to pass configuration values to UglifyJS.
    //See https://github.com/mishoo/UglifyJS for the possible values.
    uglify: {
        toplevel: true,
        ascii_only: true,
        beautify: true,
        max_line_length: 1000
    },

    //If using Closure Compiler for script optimization, these config options
    //can be used to configure Closure Compiler. See the documentation for
    //Closure compiler for more information.
    closure: {
        CompilerOptions: {},
        CompilationLevel: 'SIMPLE_OPTIMIZATIONS',
        loggingLevel: 'WARNING'
    },

    //Allow CSS optimizations. Allowed values:
    //- "standard": @import inlining, comment removal and line returns.
    //Removing line returns may have problems in IE, depending on the type
    //of CSS.
    //- "standard.keepLines": like "standard" but keeps line returns.
    //- "none": skip CSS optimizations.
    //- "standard.keepComments": keeps the file comments, but removes line
    //returns.  (r.js 1.0.8+)
    //- "standard.keepComments.keepLines": keeps the file comments and line
    //returns. (r.js 1.0.8+)
    optimizeCss: "none",//"standard.keepLines",

    //If optimizeCss is in use, a list of of files to ignore for the @import
    //inlining. The value of this option should be a comma separated list
    //of CSS file names to ignore. The file names should match whatever
    //strings are used in the @import calls.
    cssImportIgnore: null,

    //cssIn is typically used as a command line option. It can be used
    //along with out to optimize a single CSS file.
    //cssIn: "path/to/main.css",
    //out: "path/to/css-optimized.css",

    //Inlines the text for any text! dependencies, to avoid the separate
    //async XMLHttpRequest calls to load those dependencies.
    inlineText: true,

    //Allow "use strict"; be included in the RequireJS files.
    //Default is false because there are not many browsers that can properly
    //process and give errors on code for ES5 strict mode,
    //and there is a lot of legacy code that will not work in strict mode.
    useStrict: false,

    //Specify build pragmas. If the source files contain comments like so:
    //>>excludeStart("fooExclude", pragmas.fooExclude);
    //>>excludeEnd("fooExclude");
    //Then the comments that start with //>> are the build pragmas.
    //excludeStart/excludeEnd and includeStart/includeEnd work, and the
    //the pragmas value to the includeStart or excludeStart lines
    //is evaluated to see if the code between the Start and End pragma
    //lines should be included or excluded. If you have a choice to use
    //"has" code or pragmas, use "has" code instead. Pragmas are harder
    //to read, but they can be a bit more flexible on code removal vs.
    //has-based code, which must follow JavaScript language rules.
    //Pragmas also remove code in non-minified source, where has branch
    //trimming is only done if the code is minified via UglifyJS or
    //Closure Compiler.
    pragmas: {
		alohaLoadInEndClosure: true
    },

    //Skip processing for pragmas.
    skipPragmas: false,

    //If skipModuleInsertion is false, then files that do not use define()
    //to define modules will get a define() placeholder inserted for them.
    //Also, require.pause/resume calls will be inserted.
    //Set it to true to avoid this. This is useful if you are building code that
    //does not use require() in the built project or in the JS files, but you
    //still want to use the optimization tool from RequireJS to concatenate modules
    //together.
    skipModuleInsertion: true,

    //If it is not a one file optimization, scan through all .js files in the
    //output directory for any plugin resource dependencies, and if the plugin
    //supports optimizing them as separate files, optimize them. Can be a
    //slower optimization. Only use if there are some plugins that use things
    //like XMLHttpRequest that do not work across domains, but the built code
    //will be placed on another domain.
    optimizeAllPluginResources: false,

    //Finds require() dependencies inside a require() or define call. By default
    //this value is false, because those resources should be considered dynamic/runtime
    //calls. However, for some optimization scenarios,
    //Introduced in 1.0.3. Previous versions incorrectly found the nested calls
    //by default.
    findNestedDependencies: false,

    //If set to true, any files that were combined into a build layer will be
    //removed from the output folder.
    removeCombined: false,

    //List the modules that will be optimized. All their immediate and deep
    //dependencies will be included in the module's file when the build is
    //done. If that module or any of its dependencies includes i18n bundles,
    //only the root bundles will be included unless the locale: section is set above.
    modules: modules,

	onBuildWrite: onBuildWrite,

    //Another way to use wrap, but uses file paths. This makes it easier
    //to have the start text contain license information and the end text
    //to contain the global variable exports, like
    //window.myGlobal = requirejs('myModule');
    //File paths are relative to the build file, or if running a commmand
    //line build, the current directory.
	wrap: {
		startFile: closureStartFrag,
		endFile: closureEndFrag,
	},

    //By default, comments that have a license in them are preserved in the
    //output. However, for a larger built files there could be a lot of
    //comment files that may be better served by having a smaller comment
    //at the top of the file that points to the list of all the licenses.
    //This option will turn off the auto-preservation, but you will need
    //work out how best to surface the license information.
    preserveLicenseComments: true,

    //Sets the logging level. It is a number. If you want "silent" running,
    //set logLevel to 4. From the logger.js file:
    //TRACE: 0,
    //INFO: 1,
    //WARN: 2,
    //ERROR: 3,
    //SILENT: 4
    //Default is 0.
    logLevel: 0,
	};
}())
