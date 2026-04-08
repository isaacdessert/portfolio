export type ReadStatus = 'reading' | 'read' | 'want';

export interface Book {
  title: string;
  author: string;
  year?: number;       // year you read it
  take?: string;       // your short take
  url?: string;        // optional link (Goodreads, etc.)
  status: ReadStatus;
}

const books: Book[] = [
  // ── Currently Reading ──────────────────────────────────────────
  {
    title: 'Staff Engineer',
    author: 'Will Larson',
    status: 'reading',
    take: 'The clearest map I\'ve found for the senior IC path.',
  },

  // ── Read ───────────────────────────────────────────────────────
  {
    title: 'The Goal',
    author: 'Eliyahu M. Goldratt & Jeff Cox',
    year: 2024,
    status: 'read',
    take: 'A compelling case for lean and the Theory of Constraints told as a novel. The core insight — that inventory is a liability, not an asset, and that anything not contributing to throughput is waste — is simple but cuts deep. What stuck most was how honestly confronting hard truths in the business led to faster solutions than any amount of number-massaging or political maneuvering. The love story subplot felt contrived and I resented that a couple of key ideas were buried in it, but the payoff thread — that fixing the factory also saved the marriage — lands. The same thinking that cleared the plant floor can clear your calendar.',
  },
  {
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    year: 2024,
    status: 'read',
    take: 'The best systems design book I\'ve read. Dense but worth every page.',
  },
  {
    title: 'An Elegant Puzzle',
    author: 'Will Larson',
    year: 2024,
    status: 'read',
    take: 'Honest, practical engineering management. Required reading for any eng lead.',
  },
  {
    title: 'The Pragmatic Programmer',
    author: 'David Thomas & Andrew Hunt',
    year: 2023,
    status: 'read',
    take: 'Timeless. The career advice holds up better than the code examples.',
  },
  {
    title: 'Accelerate',
    author: 'Nicole Forsgren, Jez Humble & Gene Kim',
    year: 2023,
    status: 'read',
    take: 'The research that made DevOps a real discipline. Changed how I think about team metrics.',
  },
  {
    title: 'The Phoenix Project',
    author: 'Gene Kim, Kevin Behr & George Spafford',
    year: 2022,
    status: 'read',
    take: 'DevOps as a novel. Corny at times but the lessons are sticky.',
  },
  {
    title: 'A Philosophy of Software Design',
    author: 'John Ousterhout',
    year: 2022,
    status: 'read',
    take: 'Short and sharp. The chapter on deep vs. shallow modules changed how I write APIs.',
  },

  // ── Want to Read ───────────────────────────────────────────────
  {
    title: 'The Manager\'s Path',
    author: 'Camille Fournier',
    status: 'want',
  },
  {
    title: 'Tidy First?',
    author: 'Kent Beck',
    status: 'want',
  },
  {
    title: 'Working in Public',
    author: 'Nadia Eghbal',
    status: 'want',
  },
];

export default books;
