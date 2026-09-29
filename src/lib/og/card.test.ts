import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderCard, clampEyebrow, type CardInput } from './card';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
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

describe('clampEyebrow', () => {
  it('leaves a 44-char eyebrow untouched (boundary: exceeds, not reaches)', () => {
    const eyebrow = 'x'.repeat(44);
    expect(clampEyebrow(eyebrow)).toBe(eyebrow);
    expect(clampEyebrow(eyebrow).length).toBe(44);
  });

  it('truncates a 45-char eyebrow to 43 chars + an ellipsis', () => {
    const eyebrow = 'x'.repeat(45);
    const result = clampEyebrow(eyebrow);
    expect(result).toBe(`${'x'.repeat(43)}…`);
    expect(result.length).toBe(44);
  });

  it('truncates the real-world long blog path that wrapped onto two lines', () => {
    const eyebrow = 'isaacdessert.dev/blog/leveraging-ai-in-non-software-development';
    const result = clampEyebrow(eyebrow);
    expect(result).toBe(`${eyebrow.slice(0, 43)}…`);
    expect(result.length).toBeLessThanOrEqual(44);
  });

  it('leaves short eyebrows alone', () => {
    expect(clampEyebrow('isaacdessert.dev/about')).toBe('isaacdessert.dev/about');
  });
});

describe('renderCard golden image', () => {
  // Fixed input matching the lab/injuries card we've eyeballed throughout this feature.
  const GOLDEN_INPUT: CardInput = {
    eyebrow: 'isaacdessert.dev/lab/injuries',
    title: 'Injury Report',
    description: 'Fantasy-relevant NFL injuries in one place, straight from ESPN.',
    footer: '#nfl #fantasy',
  };
  const GOLDEN_PATH = path.join(__dirname, '__fixtures__', 'card-golden.png');

  // Max fraction of pixels allowed to differ by more than CHANNEL_TOLERANCE in any channel
  // (cross-platform font hinting/antialiasing wiggle room). A real rendering regression — like
  // fonts silently failing to decode into tofu — blows way past this.
  const MAX_DIFF_RATIO = 0.01;
  const CHANNEL_TOLERANCE = 32;

  async function rawRgba(input: Buffer) {
    return sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  }

  it('matches the committed reference PNG within an antialiasing tolerance', async () => {
    const rendered = await renderCard(GOLDEN_INPUT);
    const golden = readFileSync(GOLDEN_PATH);

    const [a, b] = await Promise.all([rawRgba(rendered), rawRgba(golden)]);

    expect(a.info.width).toBe(b.info.width);
    expect(a.info.height).toBe(b.info.height);
    expect(a.info.channels).toBe(b.info.channels);

    const { width, height, channels } = a.info;
    const totalPixels = width * height;
    let diffPixels = 0;

    for (let p = 0; p < totalPixels; p++) {
      const offset = p * channels;
      let maxChannelDiff = 0;
      for (let c = 0; c < channels; c++) {
        const diff = Math.abs(a.data[offset + c] - b.data[offset + c]);
        if (diff > maxChannelDiff) maxChannelDiff = diff;
      }
      if (maxChannelDiff > CHANNEL_TOLERANCE) diffPixels++;
    }

    const diffRatio = diffPixels / totalPixels;
    expect(diffRatio).toBeLessThanOrEqual(MAX_DIFF_RATIO);
  });
});
