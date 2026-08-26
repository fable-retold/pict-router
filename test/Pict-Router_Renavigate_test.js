/*
	Navigating to the route you are already on.

	The underlying router declines to re-run a handler for the route it is already on, and that is
	usually right. What was missing was any way to KNOW: navigate() returned nothing, so a caller could
	not tell "went there" from "did nothing", and code that assumed it had moved left whatever was on
	screen exactly where it was.

	None of this changes the default behaviour. navigate() still navigates and still declines the same
	way; it just reports what happened. renavigate() is a new, explicit opt-in for the case where
	something has rendered over a route without telling the router.
*/

const Chai = require('chai');
const Expect = Chai.expect;

const libPict = require('pict');
const libPictRouter = require(`../source/Pict-Router.js`);

function routerFixture()
{
	let tmpPict = new libPict();
	new libPict.EnvironmentObject(tmpPict);
	tmpPict.addApplication();
	return tmpPict.addProvider('PictRouter', { RouterMode: 'memory' }, libPictRouter);
}

suite
(
	`Pict Router - navigating to where you already are`,
	() =>
	{
		test('navigate reports true when the route actually resolves', (fDone) =>
		{
			let tmpRouter = routerFixture();
			let tmpRuns = 0;
			tmpRouter.addRoute('/alpha', () => { tmpRuns++; });
			Expect(tmpRouter.navigate('/alpha')).to.equal(true);
			Expect(tmpRuns, 'the handler ran').to.equal(1);
			return fDone();
		});

		test('navigate reports FALSE for the route it is already on, and does not re-run the handler', (fDone) =>
		{
			let tmpRouter = routerFixture();
			let tmpRuns = 0;
			tmpRouter.addRoute('/alpha', () => { tmpRuns++; });
			tmpRouter.navigate('/alpha');
			// The behaviour is unchanged -- the handler does NOT run again. What is new is being told.
			Expect(tmpRouter.navigate('/alpha'), 'the router declined').to.equal(false);
			Expect(tmpRuns, 'still one run; this does not change the default').to.equal(1);
			return fDone();
		});

		test('a different route still resolves after a declined one', (fDone) =>
		{
			let tmpRouter = routerFixture();
			let tmpAlpha = 0, tmpBeta = 0;
			tmpRouter.addRoute('/alpha', () => { tmpAlpha++; });
			tmpRouter.addRoute('/beta', () => { tmpBeta++; });
			tmpRouter.navigate('/alpha');
			Expect(tmpRouter.navigate('/alpha')).to.equal(false);
			Expect(tmpRouter.navigate('/beta'), 'a real move still reports true').to.equal(true);
			Expect(tmpAlpha).to.equal(1);
			Expect(tmpBeta).to.equal(1);
			return fDone();
		});

		test('renavigate runs the handler for the route it is already on', (fDone) =>
		{
			let tmpRouter = routerFixture();
			let tmpRuns = 0;
			tmpRouter.addRoute('/alpha', () => { tmpRuns++; });
			tmpRouter.navigate('/alpha');
			Expect(tmpRuns).to.equal(1);
			Expect(tmpRouter.renavigate('/alpha'), 'it re-entered').to.equal(true);
			Expect(tmpRuns, 'the handler ran again, which navigate alone would not do').to.equal(2);
			return fDone();
		});

		test('renavigate on a DIFFERENT route is just a navigation, not a double run', (fDone) =>
		{
			let tmpRouter = routerFixture();
			let tmpAlpha = 0, tmpBeta = 0;
			tmpRouter.addRoute('/alpha', () => { tmpAlpha++; });
			tmpRouter.addRoute('/beta', () => { tmpBeta++; });
			tmpRouter.navigate('/alpha');
			Expect(tmpRouter.renavigate('/beta')).to.equal(true);
			Expect(tmpBeta, 'ran once, not twice').to.equal(1);
			Expect(tmpAlpha).to.equal(1);
			return fDone();
		});

		test('a caller\'s own already hook still runs, and still receives the match', (fDone) =>
		{
			let tmpRouter = routerFixture();
			let tmpAlready = 0;
			let tmpSawMatch = false;
			tmpRouter.addRoute('/alpha', () => { }, undefined,
				{ already: (pMatch) => { tmpAlready++; tmpSawMatch = !!pMatch; } });
			tmpRouter.navigate('/alpha');
			Expect(tmpAlready, 'not fired on the first, real navigation').to.equal(0);
			tmpRouter.navigate('/alpha');
			Expect(tmpAlready, 'fired when the router declined').to.equal(1);
			Expect(tmpSawMatch, 'and was handed the match').to.equal(true);
			return fDone();
		});

		test('a caller\'s own before hook still runs, so hooks are passed through and not swallowed', (fDone) =>
		{
			let tmpRouter = routerFixture();
			let tmpBefore = 0;
			tmpRouter.addRoute('/alpha', () => { }, undefined,
				{ before: (fNext) => { tmpBefore++; fNext(); } });
			tmpRouter.navigate('/alpha');
			Expect(tmpBefore).to.equal(1);
			return fDone();
		});

		test('addRoute with no hooks argument behaves exactly as it always did', (fDone) =>
		{
			// The compatibility guarantee: hundreds of applications call addRoute with two or three
			// arguments and must not notice any of this.
			let tmpRouter = routerFixture();
			let tmpRuns = 0;
			tmpRouter.addRoute('/alpha', () => { tmpRuns++; }, 'Alpha');
			Expect(tmpRouter.navigate('/alpha')).to.equal(true);
			Expect(tmpRuns).to.equal(1);
			return fDone();
		});

		test('a template route still renders, and is re-enterable', (fDone) =>
		{
			let tmpRouter = routerFixture();
			tmpRouter.addRoute('/tpl', 'a template');
			Expect(tmpRouter.navigate('/tpl')).to.equal(true);
			Expect(tmpRouter.navigate('/tpl')).to.equal(false);
			Expect(tmpRouter.renavigate('/tpl')).to.equal(true);
			return fDone();
		});

		test('lastMatch reports where the router is', (fDone) =>
		{
			let tmpRouter = routerFixture();
			tmpRouter.addRoute('/alpha', () => { });
			tmpRouter.navigate('/alpha');
			let tmpMatch = tmpRouter.lastMatch();
			Expect(tmpMatch).to.be.an('object');
			Expect(tmpMatch.url).to.equal('alpha');
			return fDone();
		});

		test('reenter on a parameterised route hands the handler its match', (fDone) =>
		{
			let tmpRouter = routerFixture();
			let tmpSeen = [];
			tmpRouter.addRoute('/thing/:id', (pData) => { tmpSeen.push(pData && pData.data ? pData.data.id : null); });
			tmpRouter.navigate('/thing/12');
			Expect(tmpSeen).to.deep.equal(['12']);
			// By the URL the caller navigated to, which is not the stored pattern -- it falls back to
			// the resolved route rather than finding nothing.
			Expect(tmpRouter.reenter('/thing/12'), 'found the handler anyway').to.equal(true);
			Expect(tmpSeen.length, 'and ran it').to.equal(2);
			Expect(tmpSeen[1], 'with the same id it resolved with').to.equal('12');
			return fDone();
		});

		test('reenter with nothing to re-enter reports false rather than throwing', (fDone) =>
		{
			let tmpRouter = routerFixture();
			Expect(tmpRouter.reenter()).to.equal(false);
			Expect(tmpRouter.reenter('/nope')).to.equal(false);
			return fDone();
		});
	}
);

suite
(
	`Pict Router - router options passthrough`,
	() =>
	{
		test('navigate passes options through and still reports', (fDone) =>
		{
			const Chai2 = require('chai');
			const Expect2 = Chai2.expect;
			const libPict2 = require('pict');
			const libPictRouter2 = require(`../source/Pict-Router.js`);
			let tmpPict = new libPict2();
			new libPict2.EnvironmentObject(tmpPict);
			tmpPict.addApplication();
			let tmpRouter = tmpPict.addProvider('PictRouter', { RouterMode: 'memory' }, libPictRouter2);
			let tmpRuns = 0;
			tmpRouter.addRoute('/alpha', () => { tmpRuns++; });
			// The shape an application uses when it writes the URL itself.
			Expect2(tmpRouter.navigate('/alpha', { updateBrowserURL: false })).to.equal(true);
			Expect2(tmpRuns).to.equal(1);
			Expect2(tmpRouter.navigate('/alpha', { updateBrowserURL: false })).to.equal(false);
			Expect2(tmpRuns, 'still declined the second time').to.equal(1);
			Expect2(tmpRouter.renavigate('/alpha', { updateBrowserURL: false })).to.equal(true);
			Expect2(tmpRuns, 'renavigate re-entered').to.equal(2);
			return fDone();
		});
	}
);
