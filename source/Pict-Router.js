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
	addRoute(pRoute, pRenderable, pTitle)
	{
		if (typeof(pRenderable) === 'function')
		{
			this.router.on(pRoute,
				(pData) =>
				{
					this._applyRouteTitle(pTitle, pData);
					return pRenderable(pData);
				});
		}
		else if (typeof(pRenderable) === 'string')
		{
			// Run this as a template, allowing some whack things with functions in template expressions.
			this.router.on(pRoute,
				(pData) =>
				{
					this._applyRouteTitle(pTitle, pData);
					this.pict.parseTemplate(pRenderable, pData, null, this.pict)
				});
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
	 * @param {string} pRoute - The route to navigate to
	 */
	navigate(pRoute)
	{
		this.router.navigate(pRoute);
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