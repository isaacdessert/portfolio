import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { renderCard } from './card';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('renderCard', () => {
  it('returns a 1200x630 PNG', async () => {
    const buf = await renderCard({
      eyebrow: 'isaacdessert.dev/about',
      title: 'About',
      description: 'About Isaac Dessert — Lead Software Engineer. Resume, skills, and experience.',
    });

    expect(buf.subarray(0, 8)).toEqual(PNG_SIGNATURE);

    const metadata = await sharp(buf).metadata();
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(630);
  });

  it('renders without a description or footer', async () => {
    const buf = await renderCard({ eyebrow: 'isaacdessert.dev/lab', title: 'Lab' });
    expect(buf.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  it('renders a long title and footer (lab project card shape)', async () => {
    const buf = await renderCard({
      eyebrow: 'isaacdessert.dev/lab/injuries',
      title: 'Injury Report: a much longer title than usual to exercise the shrink rules',
      description: 'Fantasy-relevant NFL injuries in one place, straight from ESPN.',
      footer: '#nfl #fantasy',
    });
    const metadata = await sharp(buf).metadata();
    expect(metadata.width).toBe(1200);
    expect(metadata.height).toBe(630);
  });
});
