# Pict Router

> **[Read the Pict-Router Documentation](https://fable-retold.github.io/pict-router/)** - interactive docs with the full API reference.

A hash-based URL router for Pict applications, built on [Navigo](https://www.npmjs.com/package/navigo). Define routes with callback functions or Pict template expressions to drive navigation, view rendering, and application state from the browser URL.

[pict-router on npm](https://www.npmjs.com/package/pict-router) | [MIT License](LICENSE)

---

## Features

- **Hash-Based Routing** - Routes match the fragment after `#` in the URL (e.g. `/index.html#/Views/Legal` routes to `/Views/Legal`)
- **Function Routes** - Register standard callback functions as route handlers
- **Template Routes** - Register Pict template expression strings as routes, enabling declarative view rendering and provider function calls
- **Configuration-Driven** - Define routes in the provider options for automatic registration on construction
- **Navigo Powered** - Built on the [Navigo](https://www.npmjs.com/package/navigo) router with the `ONE` matching strategy
- **Pict Provider** - Extends `pict-provider` and integrates with the Pict service lifecycle

## Installation

```bash
npm install pict-router
```

## Quick Start

```javascript
const libPict = require('pict');

let _Pict = new libPict();

// Add the router as a provider
let _Router = _Pict.addProvider('Pict-Router', {}, require('pict-router'));

// Add a route with a callback function
_Router.addRoute('/Home', (pData) =>
{
	console.log('Navigated to Home');
});

// Navigate programmatically
_Router.navigate('/Home');
```

## Usage

### Function Routes

Pass a callback function as the route handler. The function receives route data from Navigo:

```javascript
_Router.addRoute('/Users/:id', (pData) =>
{
	console.log('User ID:', pData.data.id);
});
```

### Template String Routes

Pass a Pict template expression string as the route handler. The template is parsed with the route data as context, allowing declarative view rendering and provider calls:

```javascript
_Router.addRoute('/Views/Legal',
	'{~LV:Pict.providers.PictRouter.adjustTestState(Record.data.Scope)~}');
```

This executes the `LogValue` template expression, calling the function at the given provider address. Template routes can trigger view `render()` functions or any other Pict service method.

### Configuration-Driven Routes

Define routes in the provider options and they will be registered automatically on construction:

```javascript
let _Router = _Pict.addProvider('Pict-Router',
{
	Routes:
	[
		{ path: '/Home', render: (pData) => { console.log('Home'); } },
		{ path: '/About', template: '{~LV:Pict.views.About.render()~}' }
	]
}, require('pict-router'));
```

Each route entry requires a `path` and either a `render` function or a `template` string.

## API

### `addRoute(pRoute, pRenderable)`

Add a route to the router.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pRoute` | `String` | The route path pattern (e.g. `/Home`, `/Users/:id`) |
| `pRenderable` | `Function` or `String` | Callback function or Pict template expression |

### `navigate(pRoute)`

Navigate to a route programmatically. Sets the browser URL, adds a history entry, and triggers the matched route handler.

| Parameter | Type | Description |
|-----------|------|-------------|
| `pRoute` | `String` | The route path to navigate to |

### `resolve()`

Trigger the router's resolution logic against the current URL. Called automatically after `addRoute`, and can be called manually to re-resolve after all routes are registered.

## Part of the Retold Framework

Pict Router is designed to work with other Pict packages:

- [pict](https://github.com/fable-retold/pict) - UI framework
- [pict-provider](https://github.com/fable-retold/pict-provider) - Provider base class
- [pict-template](https://github.com/fable-retold/pict-template) - Template engine for expression routes
- [fable](https://github.com/fable-retold/fable) - Application services framework

## Testing

Run the test suite:

```bash
npm test
```

Run with coverage:

```bash
npm run coverage
```

## Related Packages

- [pict](https://github.com/fable-retold/pict) - MVC application framework
- [pict-provider](https://github.com/fable-retold/pict-provider) - Data provider base class
- [fable](https://github.com/fable-retold/fable) - Application services framework

## License

MIT

## Contributing

Pull requests are welcome. For details on our code of conduct, contribution process, and testing requirements, see the [Retold Contributing Guide](https://github.com/fable-retold/retold/blob/main/docs/contributing.md).
