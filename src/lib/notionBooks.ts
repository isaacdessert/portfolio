export type BookStatus = 'reading' | 'read' | 'want';

export interface Book {
  title: string;
  author: string;
  status: BookStatus;
  year?: number;
  take?: string;
  url?: string;
}

const STATUS_MAP: Record<string, BookStatus> = {
  reading: 'reading',
  read: 'read',
  want: 'want',
};

function joinPlainText(prop: any): string {
  const arr = prop?.type === 'title' ? prop.title : prop?.type === 'rich_text' ? prop.rich_text : null;
  if (!Array.isArray(arr)) return '';
  return arr
    .map((t: any) => t.plain_text)
    .join('')
    .trim();
}

/** Maps a Notion database page to a Book, or null if it has no title or an unknown status. */
export function pageToBook(page: { properties: Record<string, any> }): Book | null {
  const properties = page.properties;

  const titleProp = Object.values(properties).find((prop: any) => prop?.type === 'title');
  const title = joinPlainText(titleProp);
  if (!title) return null;

  const statusProp = properties['Status'];
  const rawStatus = statusProp?.type === 'select' ? statusProp.select?.name : undefined;
  const status = rawStatus ? STATUS_MAP[rawStatus.toLowerCase()] : undefined;
  if (!status) return null;

  const author = joinPlainText(properties['Author']);

  const yearProp = properties['Year'];
  const year =
    yearProp?.type === 'number' && typeof yearProp.number === 'number' ? yearProp.number : undefined;

  const take = joinPlainText(properties['Take']) || undefined;

  const urlProp = properties['Link'];
  const url = urlProp?.type === 'url' && urlProp.url ? urlProp.url : undefined;

  return { title, author, status, year, take, url };
}

/** Year descending (books without a year last), then title A→Z. Returns a new array. */
export function sortBooks(books: Book[]): Book[] {
  return [...books].sort((a, b) => {
    if (a.year !== b.year) {
      if (a.year === undefined) return 1;
      if (b.year === undefined) return -1;
      return b.year - a.year;
    }
    return a.title.localeCompare(b.title);
  });
}
