import { describe, it, expect } from 'vitest';
import { addLabRoute, LAB_SUBDOMAIN_ROUTE } from './vercel-routes.mjs';

describe('addLabRoute', () => {
  it('inserts the lab route immediately before the filesystem handle, keeping other routes in order', () => {
    const config = {
      version: 3,
      routes: [
        { src: '^/_astro/(.*)$', headers: {}, continue: true },
        { handle: 'filesystem' },
        { src: '/.*', dest: '/404.html', status: 404 },
      ],
    };
    const result = addLabRoute(config);
    expect(result.routes).toEqual([
      { src: '^/_astro/(.*)$', headers: {}, continue: true },
      LAB_SUBDOMAIN_ROUTE,
      { handle: 'filesystem' },
      { src: '/.*', dest: '/404.html', status: 404 },
    ]);
  });

  it('is idempotent: calling twice yields exactly one copy of the route', () => {
    const config = { routes: [{ handle: 'filesystem' }] };
    const once = addLabRoute(config);
    const twice = addLabRoute(once);
    expect(
      twice.routes.filter((r: { dest?: string; src?: string }) => r.dest === LAB_SUBDOMAIN_ROUTE.dest && r.src === LAB_SUBDOMAIN_ROUTE.src),
    ).toHaveLength(1);
    expect(twice.routes).toEqual(once.routes);
  });

  it('throws if there is no filesystem handle', () => {
    const config = { routes: [{ src: '/.*', dest: '/404.html', status: 404 }] };
    expect(() => addLabRoute(config)).toThrow(/filesystem/);
  });

  it('does not mutate the input config', () => {
    const config = { routes: [{ handle: 'filesystem' }] };
    const routesBefore = config.routes;
    addLabRoute(config);
    expect(config.routes).toBe(routesBefore);
    expect(config.routes).toEqual([{ handle: 'filesystem' }]);
  });

  it('treats routes as absent (defaulting to []) when config.routes is undefined', () => {
    expect(() => addLabRoute({})).toThrow(/filesystem/);
  });
});

describe('LAB_SUBDOMAIN_ROUTE host/path emulation', () => {
  const hostRe = new RegExp(`^${LAB_SUBDOMAIN_ROUTE.has[0].value}$`);
  const pathRe = new RegExp(LAB_SUBDOMAIN_ROUTE.src);

  function rewrite(host: string, pathname: string): string | null {
    const h = host.match(hostRe);
    if (!h || !pathRe.test(pathname)) return null;
    return `/lab/${h.groups!.slug}/${pathname.slice(1)}`;
  }

  it.each([
    ['hello.isaacdessert.dev', '/', '/lab/hello/'],
    ['hello.isaacdessert.dev', '/about', '/lab/hello/about'],
    ['pixel-garden.isaacdessert.dev', '/a/b', '/lab/pixel-garden/a/b'],
  ])('%s%s → %s', (host, p, expected) => {
    expect(rewrite(host, p)).toBe(expected);
  });

  it.each([
    ['isaacdessert.dev', '/'],
    ['www.isaacdessert.dev', '/'],
    ['a.b.isaacdessert.dev', '/'],
    ['hello.example.com', '/'],
    ['hello.isaacdessert.dev', '/_astro/index.abc.js'],
    ['hello.isaacdessert.dev', '/lab/hello/api/visits'],
    ['hello.isaacdessert.dev', '/favicon.svg'],
    ['hello.isaacdessert.dev', '/_image?href=x'],
    ['hello.isaacdessert.dev', '/_server-islands/Foo'],
    ['hello.isaacdessert.dev', '/_vercel/insights/script.js'],
    ['hello.isaacdessert.dev', '/robots.txt'],
    ['hello.isaacdessert.dev', '/sitemap-index.xml'],
    ['hello.isaacdessert.dev', '/sitemap-0.xml'],
    ['hello.isaacdessert.dev', '/og-default.png'],
  ])('does not rewrite %s%s', (host, p) => {
    expect(rewrite(host, p)).toBeNull();
  });
});
