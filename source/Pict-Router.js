const libPictProvider = require('pict-provider');
const libNavigo = require('navigo');

const _DEFAULT_PROVIDER_CONFIGURATION =
{
	ProviderIdentifier: 'Pict-Router',

	AutoInitialize: true,
	AutoInitializeOrdinal: 0,

	// When true, addRoute() will NOT auto-resolve after each route is added.
	// This is useful in auth-gated SPAs where routes should only resolve after
	// the DOM is ready (e.g. after login).  Can also be set globally via
	// pict.settings.RouterSkipRouteResolveOnAdd — either one enables the skip.
	SkipRouteResolveOnAdd: false,

	// Document title management.  When a DefaultTitle is set (or a per-route title
	// is passed to addRoute), the router keeps document.title in step with the
	// current route: a route with a title renders `<title><TitleSuffix>`, a route
	// without one falls back to DefaultTitle so a title never lingers from the
	// previous page.  All three are empty by default, so with no configuration the
	// router does not touch document.title (fully backward compatible).
	DefaultTitle: '',
	TitleSuffix: ''
}

class PictRouter extends libPictProvider
{
	constructor(pFable, pOptions, pServiceHash)
	{
		let tmpOptions = Object.assign({}, _DEFAULT_PROVIDER_CONFIGURATION, pOptions);
		super(pFable, tmpOptions, pServiceHash);

		// Initialize the navigo router and set the base path to '/'
		this.router = new libNavigo('/', { strategy: 'ONE', hash: true });

		// BEFORE the Routes option is processed below, because that calls addRoute, which writes here.
		// Route pattern -> handler, so renavigate()/reenter() can run a route the router is already on.
		this._routeHandlers = {};
		// Set by the `already` hook every route carries; read by navigate() to report whether the
		// router actually resolved.  See navigate().
		this._lastNavigateDeclined = false;

		if (this.options.Routes)
		{
			for (let i = 0; i < this.options.Routes.length; i++)
			{
				if (this.options.Routes[i].path && this.options.Routes[i].template)
				{
					this.addRoute(this.options.Routes[i].path, this.options.Routes[i].template);
				}
				else if (this.options.Routes[i].path && this.options.Routes[i].render)
				{
					this.addRoute(this.options.Routes[i].path, this.options.Routes[i].render);
				}
				else
				{
					this.pict.log.warn(`Route ${i} is missing a render function or template string.`);
				}
			}
		}

		// This is the route to render after load
		this.afterPersistView = '/Manyfest/Overview';

	}

	get currentScope()
	{
		return this.AppData?.ManyfestRecord?.Scope ?? 'Default';
	}

	forwardToScopedRoute(pData)
	{
		this.navigate(`${pData.url}/${this.currentScope}`);
	}

	onInitializeAsync(fCallback)
	{
		return super.onInitializeAsync(fCallback);
	}

	/**
	 * Compose a document title from a page title and the configured suffix.  An empty page title
	 * falls back to DefaultTitle so a titleless route never inherits the previous page's title.
	 *
	 * @param {string} pTitle - the page-specific title (may be empty)
	 * @returns {string}
	 */
	composeTitle(pTitle)
	{
		let tmpTitle = (typeof pTitle === 'string') ? pTitle : '';
		if (!tmpTitle) { return this.options.DefaultTitle || ''; }
		let tmpSuffix = this.options.TitleSuffix || '';
		return tmpSuffix ? (tmpTitle + tmpSuffix) : tmpTitle;
	}

	/**
	 * Set document.title from a page title (applying the configured suffix).  Public so async / entity
	 * pages can set their title once the record loads, after the route handler has already run.
	 *
	 * @param {string} pTitle - the page-specific title
	 */
	setDocumentTitle(pTitle)
	{
		if (typeof document === 'undefined') { return; }
		document.title = this.composeTitle(pTitle);
	}

	// Whether the router should manage document.title at all: only once a DefaultTitle or TitleSuffix is
	// configured, or a per-route title is supplied.  Keeps the no-configuration path from touching the DOM.
	_managesTitle(pTitle)
	{
		return (pTitle !== undefined) || !!this.options.DefaultTitle || !!this.options.TitleSuffix;
	}

	// Apply a route's title on match.  A per-route title (string or (pData)=>string) wins; a route with no
	// title resets to DefaultTitle so the previous page's title does not linger.
	_applyRouteTitle(pTitle, pData)
	{
		if (typeof document === 'undefined' || !this._managesTitle(pTitle)) { return; }
		let tmpResolved = (typeof pTitle === 'function') ? pTitle(pData) : pTitle;
		document.title = this.composeTitle(tmpResolved);
	}

	/**
	 * Add a route to the router.
	 *
	 * @param {string} pRoute - the route pattern
	 * @param {function|string} pRenderable - a handler function or a template string
	 * @param {string|function} [pTitle] - optional document title for this route: a string, or a
	 *        (pData)=>string resolved on match.  Requires DefaultTitle/TitleSuffix configured (or this
	 *        arg present) for the router to touch document.title.
	 */
	addRoute(pRoute, pRenderable, pTitle, pHooks)
	{
		let tmpHandler = null;
		if (typeof(pRenderable) === 'function')
		{
			tmpHandler = (pData) =>
				{
					this._applyRouteTitle(pTitle, pData);
					return pRenderable(pData);
				};
		}
		else if (typeof(pRenderable) === 'string')
		{
			// Run this as a template, allowing some whack things with functions in template expressions.
			tmpHandler = (pData) =>
				{
					this._applyRouteTitle(pTitle, pData);
					this.pict.parseTemplate(pRenderable, pData, null, this.pict)
				};
		}
		if (tmpHandler)
		{
			// Remember the handler so renavigate() can run it for a route the router is already on.
			// Keyed WITHOUT the leading slash, which is how the underlying router reports a matched
			// route's path -- so a lookup by pattern and a lookup off a live match agree.
			this._routeHandlers[this._routeKey(pRoute)] = tmpHandler;
			this.router.on(pRoute, tmpHandler, this._composeHooks(pRoute, pHooks));
		}
		else
		{
			// renderable isn't usable!
			this.pict.log.warn(`Route ${pRoute} has an invalid renderable.`);
			return;
		}

		// By default, resolve after each route is added (legacy behavior).
		// Applications can skip this by setting SkipRouteResolveOnAdd: true in
		// the provider config JSON, or globally via
		// pict.settings.RouterSkipRouteResolveOnAdd.  Either one will prevent
		// premature route resolution before views are rendered.
		if (!this.options.SkipRouteResolveOnAdd && !this.pict.settings.RouterSkipRouteResolveOnAdd)
		{
			this.resolve();
		}
	}

	/**
	 * Navigate to a given route (set the browser URL string, add to history, trigger router)
	 *
	 * RETURNS WHETHER THE ROUTE ACTUALLY RESOLVED.  Navigating to the route you are already on is a
	 * no-op by design -- the underlying router declines to run the handler again -- and that is usually
	 * right.  What was missing is any way to KNOW: navigate() returned nothing, so a caller could not
	 * tell "went there" from "did nothing", and code that assumed it had moved would leave whatever was
	 * on screen exactly where it was.  This does not change the behaviour, only reports it.
	 *
	 * The answer comes from the router's own signal rather than by comparing URL strings: every route
	 * carries an internal `already` hook (see _composeHooks) that the router fires when it declines.
	 *
	 * Note for asynchronous route hooks: if an application's before-hook resolves asynchronously the
	 * router has not finished by the time this returns, and this reports true (it did not decline).
	 * That is the same answer callers effectively assumed before this existed.
	 *
	 * @param {string} pRoute - The route to navigate to
	 * @param {object} [pOptions] - options for the underlying router (for example
	 *        { updateBrowserURL: false } for an application that writes the URL itself)
	 * @returns {boolean} true when the route resolved, false when the router was already on it
	 */
	navigate(pRoute, pOptions)
	{
		this._lastNavigateDeclined = false;
		if (pOptions) { this.router.navigate(pRoute, pOptions); }
		else { this.router.navigate(pRoute); }
		return !this._lastNavigateDeclined;
	}

	/**
	 * Navigate to a route, and run its handler even if the router is already on it.
	 *
	 * For the legitimate "enter this route again" case: something has rendered over the route without
	 * telling the router (a form opened in place, a modal took the pane), so the router's idea of what
	 * is on screen and what is actually on screen have come apart, and asking to go there again has to
	 * mean something.  Prefer giving that state a route of its own where you can; use this where you
	 * cannot.
	 *
	 * @param {string} pRoute - The route to navigate to
	 * @param {object} [pOptions] - options for the underlying router, as navigate()
	 * @returns {boolean} true when the handler ran, either by navigation or by re-entry
	 */
	renavigate(pRoute, pOptions)
	{
		if (this.navigate(pRoute, pOptions)) { return true; }
		return this.reenter(pRoute);
	}

	/**
	 * Run the handler for the route the router is currently on, without touching history.
	 *
	 * @param {string} [pRoute] - the route pattern to re-enter; defaults to the last resolved route
	 * @returns {boolean} true when a handler was found and run
	 */
	reenter(pRoute)
	{
		let tmpMatch = this.lastMatch();
		let tmpHandler = pRoute ? this._routeHandlers[this._routeKey(pRoute)] : null;
		// A caller re-entering by the URL it navigated to ('/thing/12') is not naming the pattern the
		// handler is stored under ('/thing/:id'), so fall back to whatever the router actually
		// resolved. That is also the no-argument case: re-enter wherever we are.
		if (!tmpHandler && tmpMatch && tmpMatch.route)
		{
			tmpHandler = this._routeHandlers[this._routeKey(tmpMatch.route.path)];
		}
		if (typeof tmpHandler !== 'function') { return false; }
		tmpHandler(tmpMatch || {});
		return true;
	}

	/**
	 * The router's last resolved match, or null.  Handy for a caller that wants to know where it is
	 * without reaching into the underlying router.
	 *
	 * @returns {object|null}
	 */
	lastMatch()
	{
		if (!this.router || typeof this.router.lastResolved !== 'function') { return null; }
		let tmpResolved = this.router.lastResolved();
		return (tmpResolved && tmpResolved[0]) ? tmpResolved[0] : null;
	}

	/**
	 * Build the hook set handed to the underlying router for one route.
	 *
	 * Always installs an `already` hook, which the router fires when it declines to re-run a handler
	 * for the route it is already on.  An application's own `already` hook still runs, after ours.
	 *
	 * @param {string} pRoute - the route pattern
	 * @param {object} [pHooks] - optional before / after / leave / already hooks from the caller
	 * @returns {object}
	 */
	// One spelling for a route, so a pattern given as '/x' and a match reporting 'x' agree.
	_routeKey(pRoute) { return String(pRoute || '').replace(/^\/+/, ''); }

	_composeHooks(pRoute, pHooks)
	{
		let tmpHooks = Object.assign({}, pHooks || {});
		let fCallerAlready = tmpHooks.already;
		tmpHooks.already = (pMatch) =>
		{
			this._lastNavigateDeclined = true;
			if (typeof fCallerAlready === 'function') { fCallerAlready(pMatch); }
		};
		return tmpHooks;
	}

	/**
	 * Navigate to the route currently in the browser's location hash.
	 *
	 * This is useful in auth-gated SPAs: when the user pastes a deep-link
	 * (e.g. #/Books) and then logs in, calling navigateCurrent() will force
	 * the router to fire the handler for whatever hash is already in the URL.
	 * Unlike resolve(), navigate() always triggers the handler even if Navigo
	 * has already "consumed" that URL.
	 *
	 * If the hash is empty or just "#/", this is a no-op and returns false.
	 *
	 * @returns {boolean} true if a route was navigated to, false otherwise
	 */
	navigateCurrent()
	{
		let tmpHash = (typeof (window) !== 'undefined' && window.location) ? window.location.hash : '';
		if (tmpHash && tmpHash.length > 2 && tmpHash !== '#/')
		{
			let tmpRoute = tmpHash.replace(/^#/, '');
			this.navigate(tmpRoute);
			return true;
		}
		return false;
	}

	/**
	 * Trigger the router resolving logic; this is expected to be called after all routes are added (to go to the default route).
	 *
	 */
	resolve()
	{
		this.router.resolve();
	}
}

module.exports = PictRouter;
module.exports.default_configuration = _DEFAULT_PROVIDER_CONFIGURATION;