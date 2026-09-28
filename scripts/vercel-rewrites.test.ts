import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
const rule = config.rewrites[0];
const hostRe = new RegExp(`^${rule.has[0].value}$`);
const inner = (rule.source as string).match(/^\/:path\((.*)\)$/)![1];
const pathRe = new RegExp(`^/${inner}$`);

function rewrite(host: string, pathname: string): string | null {
  const h = host.match(hostRe);
  if (!h || !pathRe.test(pathname)) return null;
  return rule.destination.replace(':slug', h.groups!.slug).replace(':path', pathname.slice(1));
}

describe('vercel.json subdomain rewrite', () => {
  it('has exactly one rewrite with a host condition', () => {
    expect(config.rewrites).toHaveLength(1);
    expect(rule.has[0].type).toBe('host');
    expect(rule.destination).toBe('/lab/:slug/:path');
  });

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
    ['hello.isaacdessert.dev', '/_astro/index.abc123.js'],
    ['hello.isaacdessert.dev', '/lab/hello/api/visits'],
    ['hello.isaacdessert.dev', '/favicon.svg'],
    ['hello.example.com', '/'],
  ])('does not rewrite %s%s', (host, p) => {
    expect(rewrite(host, p)).toBeNull();
  });
});
