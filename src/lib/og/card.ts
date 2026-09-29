import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

export interface CardInput {
  eyebrow: string;
  title: string;
  description?: string;
  footer?: string;
}

const WIDTH = 1200;
const HEIGHT = 630;

const COLOR_BG = '#0d0d0d';
const COLOR_YELLOW = '#f5e642';
const COLOR_GREEN = '#39ff14';
const COLOR_TEXT = '#e8e8e8';
const COLOR_MUTED = '#6b6b6b';

const require = createRequire(import.meta.url);

interface FontDef {
  name: string;
  data: Buffer;
  weight: 400 | 700;
  style: 'normal';
}

let fontsCache: FontDef[] | null = null;

/** Reads the Fontsource woff files once and caches them (Satori can't read woff2). */
function loadFonts(): FontDef[] {
  if (!fontsCache) {
    fontsCache = [
      {
        name: 'JetBrains Mono',
        data: readFileSync(
          require.resolve('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff'),
        ),
        weight: 400,
        style: 'normal',
      },
      {
        name: 'JetBrains Mono',
        data: readFileSync(
          require.resolve('@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff'),
        ),
        weight: 700,
        style: 'normal',
      },
      {
        name: 'Inter',
        data: readFileSync(require.resolve('@fontsource/inter/files/inter-latin-400-normal.woff')),
        weight: 400,
        style: 'normal',
      },
    ];
  }
  return fontsCache;
}

/** Title shrinks as it grows so long titles still fit in 3 lines. */
function titleFontSize(title: string): number {
  if (title.length > 56) return 48;
  if (title.length > 32) return 56;
  return 72;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

// Faint grid like the homepage hero. Kept as a fallback-friendly single style object:
// if Satori ever rejects multi-layer backgroundImage, drop to COLOR_BG only here.
const GRID_BACKGROUND = {
  backgroundImage:
    'linear-gradient(rgba(245, 230, 66, 0.06) 1px, transparent 1px), linear-gradient(to right, rgba(245, 230, 66, 0.06) 1px, transparent 1px)',
  backgroundSize: '60px 60px',
};

function buildTree(input: CardInput) {
  const { eyebrow, title, footer } = input;
  const description = input.description ? truncate(input.description, 150) : undefined;

  return {
    type: 'div',
    props: {
      style: {
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        width: `${WIDTH}px`,
        height: `${HEIGHT}px`,
        padding: '72px',
        backgroundColor: COLOR_BG,
        ...GRID_BACKGROUND,
        fontFamily: 'JetBrains Mono',
      },
      children: [
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              fontFamily: 'JetBrains Mono',
              fontSize: 28,
              color: COLOR_GREEN,
            },
            children: eyebrow,
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '28px',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 3,
                    overflow: 'hidden',
                    fontFamily: 'JetBrains Mono',
                    fontWeight: 700,
                    fontSize: titleFontSize(title),
                    lineHeight: 1.25,
                    color: COLOR_YELLOW,
                  },
                  children: title,
                },
              },
              ...(description
                ? [
                    {
                      type: 'div',
                      props: {
                        style: {
                          display: 'flex',
                          fontFamily: 'Inter',
                          fontWeight: 400,
                          fontSize: 32,
                          lineHeight: 1.4,
                          color: COLOR_TEXT,
                        },
                        children: description,
                      },
                    },
                  ]
                : []),
            ],
          },
        },
        {
          type: 'div',
          props: {
            style: {
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
            },
            children: [
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    fontFamily: 'JetBrains Mono',
                    fontSize: 26,
                    color: COLOR_GREEN,
                  },
                  children: footer ?? '',
                },
              },
              {
                type: 'div',
                props: {
                  style: {
                    display: 'flex',
                    fontFamily: 'JetBrains Mono',
                    fontSize: 26,
                    color: COLOR_MUTED,
                  },
                  children: 'Isaac Dessert',
                },
              },
            ],
          },
        },
      ],
    },
  };
}

/** Renders a 1200x630 PNG Open Graph card for a page. */
export async function renderCard(input: CardInput): Promise<Buffer> {
  const svg = await satori(buildTree(input), {
    width: WIDTH,
    height: HEIGHT,
    fonts: loadFonts(),
  });

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: WIDTH },
  });
  return resvg.render().asPng();
}
