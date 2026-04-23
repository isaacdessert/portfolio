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
    take: 'A really great book that shows the benefit of lean methodology and just-in-time. It focuses solely on the goal, getting rid of any complex number manipulation or focus on things that don\'t lead to the goal of money being made, and shows that inventory bears a cost. It\'s not an asset but more of a liability. It also shows interesting mechanisms around pushing against political temptations in the workforce to pander, embellish, or hide away from the difficult issues in the business. Facing them head-on and being honest about current realities allows you to come up with solutions rapidly. The love story played throughout felt a little awkward and forced. The two bits of information buried in those interactions made it something I felt I couldn\'t skip, and that was one area I personally didn\'t enjoy. I did like the overarching theme though. The sacrifice of putting in extra hours at work and the proverbial treadmill the main character was on was hurting his family and marriage. The processes changed at the office could be applied to home as well, and having things function at work did help his home life, which I think does have some merit.',
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
