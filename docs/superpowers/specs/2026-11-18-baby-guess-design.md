# Baby Guess — Design

**Date:** 2026-11-18
**Status:** Approved in a grilling session (Q1–Q29), pending spec review
**Project:** lab project `src/pages/lab/baby-guess/` → `baby-guess.isaacdessert.dev` (also
`isaacdessert.dev/lab/baby-guess/`), `status: 'unlisted'`
**Vocabulary:** every capitalised term (Guess, Guesser, Board, Candidate, Final Five, Decoy, Hint,
Deadline, Due Date, Reveal, Answer, Host, Winner, Partial Winner) is defined in `GLOSSARY.md`.
**Background:** `docs/research/2026-11-18-portfolio-as-server.md` (what the lab can host; option (a)).

## Intent

Friends and family each submit one Guess (first + middle name) for the baby before the Deadline.
After the Deadline, two Boards appear: first names and middle names. Every day Candidates are
Eliminated until each Board shows only its Final Five on the Due Date. The Host chose those five,
and they include the Answer. The Host triggers the Reveal by hand, whenever the baby actually
arrives.

**Success:** grandparents can guess from a group-chat link on a phone in under a minute, the Answer
cannot be worked out from the site before the Reveal, and the Host has no daily chores.

## 1. The game

### Phases

The phase is derived, never stored: `setup → guessing → boards → revealed`.

| Phase | When | Guessers see |
|---|---|---|
| `setup` | Host hasn't set the dates and Hints yet | "Coming soon" |
| `guessing` | today (Central) ≤ last guessing day | the form, both Hints, "N guessed so far", their own Guess |
| `boards` | after the Deadline, before the Reveal | both Hints and the two Board tabs |
| `revealed` | the Host has revealed | the Answer, Winners, Partial Winners, Boards with the Answer highlighted, everyone's Guess by name |

- **Days** are calendar dates in `America/Chicago`. Every boundary (the Deadline, each
  Elimination) is midnight Central.
- **Deadline:** the Host sets the *last guessing day*. Guessing closes at the midnight that ends it.

### Guesses

- A Guess is `{ guesser, first, middle }`. One per Guesser, and Guesser names are compared after
  normalisation (below).
  - A second Guess under a taken name is refused with
    `409 "Someone named <name> already guessed. Add your last initial."`.
  - Nobody can edit a Guess. Before the lock, the Host can delete one so the person can submit again.
- The device stores its own Guess in `localStorage` (wrapped in try/catch, like any optional
  convenience) and shows it back.
- **Normalisation** (used for Guesser names and Candidate matching): trim, collapse internal
  whitespace, turn curly apostrophes into `'`, NFD + strip combining marks, lowercase. So
  "Zoë" = "zoe", but "Aiden" ≠ "Aidan".
- **Validation:** each name part is 1–30 characters of letters/marks, spaces, hyphens and
  apostrophes (`/^[\p{L}\p{M}' -]+$/u` after apostrophe normalisation). Guesser name: 1–50
  printable characters.

### Boards and Candidates

- Two Boards, `first` and `middle`, each running as its own game. A Candidate is a normalised name
  on one Board, backed by every Guess and Decoy that has it in that position.
- **Display spelling:** the earliest backer's spelling. An all-lower or all-upper spelling is
  title-cased; mixed case ("McKenzie") is kept as typed.
- Candidates are always listed alphabetically, never by popularity.

### Decoys

- A Decoy is a made-up first + middle name the Host adds from the Host view, any time before the
  lock. It is how the Answer gets onto the Boards if nobody guessed it.
- Decoys count toward "N guessed so far" and back Candidates like any Guess. They never win and are
  never listed by name.
- **Change from the grilling session:** Decoys have no Guesser name. They don't need one, and
  without one a Decoy can never block a real person's name ("Someone named Aunt May already
  guessed").
- Guidance shown in the Host view:
  - Add Decoys before the Deadline when possible, so the count stays consistent with the Boards.
  - Put at least one Decoy besides the Answer in each Final Five, so family comparing notes can't
    isolate the one name nobody guessed.

### Final Five and the lock

- After the Deadline, the Host view lists each Board's Candidates with their counts (real Guesses
  and Decoys shown separately). The top 5 by real-Guess count are pre-selected, ties broken
  alphabetically.
- The Host adjusts both Final Fives and locks once, for both Boards.
  - Locking needs exactly 5 distinct existing Candidates per Board, so a Board with fewer than 5
    needs Decoys first.
  - The lock is final, and the Host view asks for confirmation.
- At the lock, each Board's other Candidates are shuffled (Fisher–Yates over
  `crypto.getRandomValues`) into a stored **Elimination order**. After the lock, Guesses and Decoys
  can no longer be added or deleted.
- The site is never told which Final Five member is the Answer until the Reveal.

### Pacing

Pacing is a pure function: the count Eliminated on day `t` for one Board.

```
inputs:  N      = Candidates in the Elimination order
         anchor = { day, eliminated }   // lock day with 0, re-set when the Due Date moves
         D      = Due Date
m = max(1, D − anchor.day)               // Elimination midnights: anchor.day+1 … D
R = N − anchor.eliminated                // still to Eliminate
k = clamp(t − anchor.day, 0, m)          // midnights passed
eliminated(t) = anchor.eliminated + (R ≤ m ? max(0, R − (m − k)) : floor(R · k / m))
```

- **Fewer Candidates than days:** one per day, timed so the last lands on the Due Date. For
  example, R = 6 with the Due Date Jan 20 Eliminates one each day from Jan 15 to Jan 20.
- **More Candidates than days:** at least one per day, with the extras spread evenly. For example,
  R = 12 over 10 days goes 1,1,1,1,2,1,1,1,1,2.
- **Moving the Due Date after the lock:** set `anchor = { day: today, eliminated: eliminated(today) }`
  under the old schedule, then spread the rest over the new window. That count never goes down.
  A Due Date of today or earlier Eliminates everything left at the next midnight.
- **Locked late** (on or after the Due Date): `m` = 1, so everything left goes at the next
  midnight.
- Each Board's Eliminated Candidates are the first `eliminated(today)` entries of its order.
- After the Due Date the Final Five simply wait for the Reveal.
- The Host view shows each Board's projected schedule ("2 left to go: Jan 19, Jan 20").

### Reveal and winners

- The Host can Reveal at any time after guessing opens. The Reveal ends the game wherever the
  Boards stand: guessing closes and pending Eliminations are skipped.
- The Host picks the Answer's first name from the first-name Board's non-Eliminated Candidates,
  and its middle name the same way. After the lock, that means from the Final Five. Before the
  lock (a very early baby), it can be any Candidate, adding a Decoy first if needed.
- **Winner:** a Guess whose first and middle both match (normalised). **Partial Winner:** exactly
  one matches, *in its position*, so "Rose Olivia" earns nothing against "Olivia Rose". Decoys
  are excluded.
- After the Reveal, the public state lists every real Guess by Guesser name, sorted by name,
  without Decoys.

## 2. Secrecy rules (each one a test)

The public API (`GET api/state`) is the only data a Guesser's browser ever gets. Before the
Reveal it must never contain:

1. Candidate counts, or anything ordered by them.
2. Guesser names, or anything linking a Guesser to a name. That includes the device's own Guess,
   which only ever comes from `localStorage`.
3. Decoy flags, at any time, including after the Reveal.
4. Final Five membership, the Elimination order, the anchor, or any future Elimination.
   - Each Candidate is `{ name, eliminated }`, and every Candidate object has exactly the same
     keys, so the shape gives nothing away.
5. The count, outside the `guessing` phase.

Every response is `cache-control: no-store`. The Host token never appears in a page's HTML or JS.

## 3. Pages and look

- **Own layout** (`_components/Layout.astro`), not `LabLayout`: no portfolio nav or footer, no
  "← lab" link, no " | Isaac Dessert" suffix. This is a deliberate exception to "pages use
  LabLayout", which nothing enforces. The layout must itself emit:
  - `<meta name="robots" content="noindex">` (`LabLayout` normally does this for unlisted projects);
  - title, description, canonical `https://baby-guess.isaacdessert.dev/`;
  - `og:*`/`twitter:*` with an **absolute** `og:image` built from an image imported from the
    project folder. It lands in `/_astro/`, which passes through on the subdomain and satisfies
    `scripts/check-og.mjs`;
  - a favicon imported the same way. `/favicon.svg` on the subdomain serves the portfolio's.
- **Styling:** a warm, light look, designed mobile-first, since most people arrive from a phone.
  - The project stylesheet carries its own `@tailwind` directives, because it can't import
    `global.css`. The bundle includes classes from all of `src/`, which is acceptable.
  - Fonts come from Fontsource npm packages, which isolation allows.
  - Visual design is worked out during implementation.
- **`index.astro`** (static): renders the shell, fetches `labUrl('baby-guess', 'api/state')`, and
  renders the phase.
  - The Boards are **tabs on this page**: "First name" (default) and "Middle name". `#middle` deep
    links, and the tabs use proper `tablist` semantics.
  - An Eliminated Candidate is greyed **and** struck through, with an accessible label, so the
    state isn't conveyed by colour alone.
- **`host/index.astro`** (static, noindex, unlinked): prompts for the token, keeps it in
  `localStorage`, and sends it as `Authorization: Bearer …`. It provides:
  - the settings: last guessing day, Due Date, and the two Hints (editable until the Deadline);
  - the Guesses table, with delete;
  - Decoys: add and delete;
  - Candidates per Board, with counts;
  - the Final Five pickers and the lock;
  - the schedule preview;
  - the Reveal;
  - the active key space (section 5).
- All links and fetches go through `labUrl()`. There are no SSR pages, which sidesteps the
  unverified subdomain-SSR routing question in the research doc.

## 4. API

All endpoints: `prerender = false`, wrapped in `handler()`, JSON bodies validated with `readBody()`.

| Endpoint | Auth | Rate limit (per IP) | Does |
|---|---|---|---|
| `GET api/state` | — | 60 / 1 m | public, phase-shaped state (sections 1–2) |
| `POST api/guess` | — | 20 / 10 m (households share an IP) | add a Guess; 409 taken name, 409 guessing closed |
| `GET api/host/state` | Host | 30 / 1 m | everything, including counts, Decoys, order and schedule |
| `POST api/host/config` | Host | 30 / 1 m | last guessing day, Due Date, Hints; a Due Date change after the lock re-anchors |
| `POST api/host/decoy` | Host | 30 / 1 m | add a Decoy (before the lock) |
| `POST api/host/remove` | Host | 30 / 1 m | `{ kind: 'guess' \| 'decoy', id }` (before the lock) |
| `POST api/host/lock` | Host | 30 / 1 m | `{ first: [5], middle: [5] }`, once, after the Deadline |
| `POST api/host/reveal` | Host | 30 / 1 m | `{ first, middle }`, from non-Eliminated Candidates |

- **Host auth:** `requireEnv('BABY_GUESS_HOST_TOKEN')`, compared with `crypto.timingSafeEqual` over
  SHA-256 digests. A mismatch returns 401. The rate limit runs first, so guessing the token is
  throttled.
- Handlers take `now: () => Date` and a store, like `injuries/_lib/feed.ts`, so the whole timeline
  is testable without waiting.

## 5. Data (Redis via `kv('baby-guess')`)

**Key space.** Preview, local dev and production all share one Upstash DB through the same
`KV_REST_API_*` vars. So every key carries an environment segment:
`lab:baby-guess:<VERCEL_ENV or "development">:<key>`. A preview rehearsal can then never write
into the real game.

- **Verify during implementation** that `VERCEL_ENV` is exposed to functions at runtime.
- The Host view displays the active key space.
- Rate-limit keys are left shared, which is harmless.

| Key | Type | Holds |
|---|---|---|
| `guesses` | hash | field = normalised Guesser name → `{ guesser, first, middle, at }`. `hsetnx` makes one-per-name atomic under simultaneous submits |
| `decoys` | hash | field = random id → `{ first, middle, at }` |
| `game` | JSON | `{ lastGuessDay, dueDate, hints: { first, middle }, lock?: { day, boards: { first, middle: { finalFive, order, anchor } } }, reveal?: { first, middle, at } }`. Only the Host writes it |

**Budget:** a public state read is about 3–4 commands (rate limit, `hgetall` ×2, `get`). Even 50
Guessers × 5 views a day × 60 days is roughly 60K commands, well inside Upstash Free's
500K/month, which is shared with injuries.

## 6. Shared change: hash commands in `src/lab/kv.ts`

Add `hsetnx(key, field, value): Promise<boolean>`, `hgetall<T>(key): Promise<Record<string, T> | null>`
and `hdel(key, field): Promise<void>` to `RedisLike`, `LabKv` and `createKv`, all with the
`lab:<slug>:` prefix applied. Extend `kv.test.ts` to cover prefixing and isolation between
projects for the new methods. This is an intentional shared change (Q29), and any project can use
it.

## 7. Code layout and tests

```
src/pages/lab/baby-guess/
  _meta.ts                 status: 'unlisted'
  index.astro              Guesser page (phases + Board tabs)
  host/index.astro         Host page
  api/state.ts  api/guess.ts  api/host/{state,config,decoy,remove,lock,reveal}.ts
  _components/Layout.astro
  _assets/                 og image, favicon
  _lib/
    names.ts      normalise, validate, display spelling         (+ test)
    days.ts       Central day, day arithmetic                   (+ test)
    pacing.ts     eliminated(t), re-anchor, projected schedule  (+ test)
    game.ts       phase, Boards/Candidates, lock rules, winners (+ test)
    project.ts    public & host state projections               (+ test, incl. every secrecy rule)
    store.ts      Redis access via kv(), key space              (+ test with fake kv)
    auth.ts       Host token check                              (+ test)
```

Test-first for `_lib/`. Pacing and secrecy get scenario tests across a full simulated timeline:
guessing, the Deadline, the lock, daily Eliminations, a Due Date moved earlier and later, an early
Reveal, and a late Reveal.

## 8. Launch checklist

- `BABY_GUESS_HOST_TOKEN` (long random value) in Vercel Production and Preview, with different
  values.
- Rehearse the whole game on a preview at `<preview-url>/lab/baby-guess/`, using a last guessing
  day of today and a Due Date a few days out. Previews have no subdomain routing.
- Merge to `main`. Then on `baby-guess.isaacdessert.dev`: set the dates and Hints, check the
  link preview in a chat app, and share the link.
- Update `CLAUDE.md`: the lab projects list, the `kv()` hash commands, and the environment
  key-space note.

## Out of scope

Accounts or logins, editing Guesses, notifications, analytics, more than one game, unlocking,
changes to Decoys or Guesses after the lock, and showing who guessed what before the Reveal.

## Open items (content, decided during implementation)

What the page calls the baby, the copy, the visual design and link-preview art, the Hint text, and
the dates. The Host enters the Hint text and dates at launch.
