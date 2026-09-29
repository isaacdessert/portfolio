import { describe, it, expect } from 'vitest';
import { ogImageFor } from './path';

describe('ogImageFor', () => {
  it('maps home to the default card', () => {
    expect(ogImageFor('/')).toBe('/og-default.png');
  });

  it('maps a lab project page to its shared card', () => {
    expect(ogImageFor('/lab/injuries/')).toBe('/og/lab/injuries.png');
    expect(ogImageFor('/lab/injuries')).toBe('/og/lab/injuries.png');
  });

  it('shares a lab project card across its sub-pages', () => {
    expect(ogImageFor('/lab/injuries/api/foo')).toBe('/og/lab/injuries.png');
  });

  it('maps a blog post to its own card', () => {
    expect(ogImageFor('/blog/my-post')).toBe('/og/blog/my-post.png');
    expect(ogImageFor('/blog/my-post/')).toBe('/og/blog/my-post.png');
  });

  it('maps the lab index to /og/lab.png', () => {
    expect(ogImageFor('/lab/')).toBe('/og/lab.png');
    expect(ogImageFor('/lab')).toBe('/og/lab.png');
  });

  it('maps the blog index to /og/blog.png', () => {
    expect(ogImageFor('/blog/')).toBe('/og/blog.png');
    expect(ogImageFor('/blog')).toBe('/og/blog.png');
  });

  it('maps any other top-level page to /og/<page>.png', () => {
    expect(ogImageFor('/about')).toBe('/og/about.png');
    expect(ogImageFor('/about/')).toBe('/og/about.png');
    expect(ogImageFor('/projects')).toBe('/og/projects.png');
    expect(ogImageFor('/reading')).toBe('/og/reading.png');
  });

  it('treats a trailing slash as optional throughout', () => {
    expect(ogImageFor('/lab/injuries')).toBe(ogImageFor('/lab/injuries/'));
    expect(ogImageFor('/about')).toBe(ogImageFor('/about/'));
  });

  it('lines up with the slugs the og card endpoint generates via getStaticPaths', () => {
    const samples: Array<[pathname: string, slug: string]> = [
      ['/about', 'about'],
      ['/projects', 'projects'],
      ['/blog/', 'blog'],
      ['/reading', 'reading'],
      ['/lab/', 'lab'],
      ['/blog/my-post', 'blog/my-post'],
      ['/lab/injuries/', 'lab/injuries'],
    ];
    for (const [pathname, slug] of samples) {
      expect(ogImageFor(pathname)).toBe(`/og/${slug}.png`);
    }
  });
});
