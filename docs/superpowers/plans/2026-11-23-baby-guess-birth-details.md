# Baby Guess: Birth Details Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every Guess also guesses the baby's birth date, time of birth, weight and length. The Host enters the real values at the Reveal, and the closest Guess in each category wins it, shown with a small chart per category.

**Architecture:**
- A new pure module, `_lib/birth.ts`, owns the Birth Details: the type, the validation for a Guess and for the real values, distances, Closest Winners and formatting.
- The existing layers thread it through: types and schemas → actions (date window, real-value limits) → projections (hidden before the Reveal, results after it) → the two pages.
- A second pure module, `_lib/strip.ts`, lays out the results charts. The pages render them with SVG built from DOM nodes.

**Tech Stack:** Astro 7 static pages with on-demand routes, TypeScript, zod 4 (`astro/zod`), Vitest 4, `npm run dev:local` (in-memory Redis stub) for the end-to-end check.

**Spec:** `docs/superpowers/specs/2026-11-19-baby-guess-birth-details-design.md`, which builds on `docs/superpowers/specs/2026-11-18-baby-guess-design.md`. Terms are in `GLOSSARY.md` (Birth Details, Closest Winner).

## Global Constraints

- **Project folder:** `src/pages/lab/baby-guess/` (`<proj>`). Isolation: import only this folder, `@lab/*`, or npm packages. Pages use `import type` for anything from `_lib` except `client.ts`, `birth.ts` and `strip.ts`, which are pure and browser-safe.
- **The four Birth Details:** `date` (a `Day`, `YYYY-MM-DD`), `time` (`"HH:MM"`, 24-hour), `weightOz` (whole ounces = `lb × 16 + oz`), `lengthIn` (inches, a multiple of 0.5).
- **Guess limits:** date within Due Date − 30 … Due Date + 30 days, inclusive, using the Due Date stored when the Guess is sent. Weight 32–239 oz (2 lb 0 oz – 14 lb 15 oz). Length 12–26 in by halves. Time 00:00–23:59.
- **Real-value limits** (at the Reveal): any date; weight 8–320 oz (0 lb 8 oz – 20 lb 0 oz); length 8–32 in by halves; the same time rule.
- **Distances:**
  - date: absolute days;
  - time: minutes on a 24-hour circle, `min(d, 1440 − d)`;
  - weight: absolute ounces;
  - length: absolute inches.
- **Winners:** closest per category wins, ties share it, Closest Winners are listed alphabetically by Guesser (`localeCompare`), and there is no "without going over" rule.
- **What counts:** Decoys never have Birth Details and never appear in Birth Details results, charts or counts. Guesses stored before this feature (no `birth`) load fine, are skipped in results and charts, and show "—" in tables.
- **Secrecy:** before the Reveal, public state carries no Birth Details at all. The only new pre-Reveal public field is `dueDate`, in the `guessing` phase only. Spec §2 of the name game still holds.
- **Formatting copy:**
  - date `Apr 5`; long date `April 3`;
  - time `3:20 pm` (lowercase am/pm, `12:00 pm` is noon, `12:05 am` is just after midnight);
  - weight `7 lb 8 oz`; length `20 in` / `20½ in`;
  - all four: `Apr 5 at 3:20 pm · 7 lb 8 oz · 20½ in`.
- **No time-zone shifts:** format a `Day` by parsing its string (month-name table), never with `new Date()` in the viewer's zone, so no viewer sees a different date.
- **No `innerHTML`/`outerHTML`/`insertAdjacentHTML` with user data.** Build DOM and SVG nodes with `createElement`/`createElementNS` and `textContent`.
- **Chart marks:**
  - dots 8 px across (`r=4`), fill `#b5533a` (passes the 3:1 contrast check on the cream surface `#fff8f0`), with a 2 px `#fff8f0` ring;
  - the real-value marker is a 2 px `var(--ink)` line labelled in ink text;
  - axis end labels in `var(--muted)`; the time axis is fixed at 12 am → 12 am (0–1440 minutes);
  - one series per chart, so no legend; the title names it;
  - each dot has a native SVG `<title>` tooltip ("Grandma Jo · Apr 5") on a transparent hit circle of `r=10`;
  - the SVG is `aria-hidden="true"`; the winner lines and the table carry the same information as text.
- **Safari 14 CSS:** no `inset`, `aspect-ratio` or `color-mix` (pinned `cssTarget`).
- **No local secrets:** never read or print `.env` values or Keychain items. For the local run, set `BABY_GUESS_HOST_TOKEN` in the command's own environment.

## Review Focus

1. **A birth just before midnight.** For an 11:58 pm birth, an 11:50 pm guess must beat a 2:00 am one, because time scoring wraps around midnight. *Test: Task 1.*
2. **A viewer in another time zone.** "Apr 5" must read "Apr 5" in California too. The date picker and the results must not shift a day. *Test: Task 1 ("shows the same date to a viewer in another time zone").*
3. **The Due Date moves after people have guessed.** A Guess is checked against the Due Date stored when it was sent. Earlier Guesses outside the new window still count, and the real birth date can be any day. *Test: Task 2.*
4. **A tiny or very large baby.** A real 1 lb 4 oz (20 oz), 9 in baby can be revealed, even though neither value is allowed as a guess. *Test: Task 2.*
5. **Older Guesses or devices.** A Guess stored before Birth Details, or a Guess a phone remembered before the update, must neither break the page nor count in the Birth Details results. *Tests: Task 3 (projection) and Task 4 (client).*

---

### Task 1: The Birth Details module

**Files:**
- Create: `<proj>/_lib/birth.ts`
- Test: `<proj>/_lib/birth.test.ts`

**Interfaces:**
- Consumes: `type Day`, `addDays`, `daysBetween`, `isDay` from `./days`.
- Produces (`_lib/birth.ts`):

```ts
export type BirthCategory = 'date' | 'time' | 'weight' | 'length';
export const BIRTH_CATEGORIES: readonly BirthCategory[] = ['date', 'time', 'weight', 'length'];
export interface BirthDetails { date: Day; time: string; weightOz: number; lengthIn: number }
export const DATE_WINDOW_DAYS = 30;
export function isTime(s: string): boolean;                                       // /^([01]\d|2[0-3]):[0-5]\d$/
export function guessBirthProblem(birth: BirthDetails, dueDate: Day): string | null; // null = valid
export function realBirthProblem(birth: BirthDetails): string | null;
export function birthValue(category: BirthCategory, birth: BirthDetails): number;   // date → days since 1970-01-01, time → minutes 0–1439, weight → oz, length → in
export function birthDistance(category: BirthCategory, guess: BirthDetails, real: BirthDetails): number;
export function closestWinners(guesses: readonly { guesser: string; birth?: BirthDetails }[], real: BirthDetails): Record<BirthCategory, string[]>;
export function formatBirthValue(category: BirthCategory, birth: BirthDetails): string;
export function formatBirthDetails(birth: BirthDetails): string;
export function formatShortDay(day: Day): string;                                 // 'Apr 5'
export function formatLongDay(day: Day): string;                                  // 'April 3'
```

**Problems.** Both validators check in the order date, time, weight, length, and return the first problem with this exact copy:

| Check | Message |
|---|---|
| date not `isDay` | `Pick a birth date.` |
| Guess date outside the window | `Pick a birth date between ${formatShortDay(dueDate − 30)} and ${formatShortDay(dueDate + 30)}.` |
| time not `isTime` | `Pick a time of birth.` |
| Guess weight not an integer in 32–239 | `Pick a weight between 2 lb 0 oz and 14 lb 15 oz.` |
| Guess length not a multiple of 0.5 in 12–26 | `Pick a length between 12 and 26 in, in half inches.` |
| real weight not an integer in 8–320 | `The real weight must be between 0 lb 8 oz and 20 lb 0 oz.` |
| real length not a multiple of 0.5 in 8–32 | `The real length must be between 8 and 32 in, in half inches.` |

`closestWinners` skips Guesses without `birth`, and returns `[]` for every category when none have it.

- [ ] **Step 1: Write the failing tests** in `birth.test.ts`. Use a local `b(date, time, weightOz, lengthIn)` builder.

```ts
const due = '2027-04-03';
it('accepts guessed dates inside the 30-day window and names the window otherwise', () => {
  expect(guessBirthProblem(b('2027-03-04', '12:00', 120, 20), due)).toBeNull();
  expect(guessBirthProblem(b('2027-05-03', '12:00', 120, 20), due)).toBeNull();
  expect(guessBirthProblem(b('2027-03-03', '12:00', 120, 20), due)).toBe('Pick a birth date between Mar 4 and May 3.');
  expect(guessBirthProblem(b('2027-05-04', '12:00', 120, 20), due)).toBe('Pick a birth date between Mar 4 and May 3.');
});
it.each([[32, null], [239, null], [31, 'w'], [240, 'w'], [120.5, 'w']])('guess weight %s', (oz, r) =>
  expect(guessBirthProblem(b(due, '12:00', oz, 20), due)).toBe(r && 'Pick a weight between 2 lb 0 oz and 14 lb 15 oz.'));
it.each([[12, null], [26, null], [20.5, null], [11.5, 'l'], [26.5, 'l'], [20.25, 'l']])('guess length %s', (inches, r) =>
  expect(guessBirthProblem(b(due, '12:00', 120, inches), due)).toBe(r && 'Pick a length between 12 and 26 in, in half inches.'));
it.each([['00:00', true], ['23:59', true], ['24:00', false], ['7:05', false], ['', false]])('isTime(%j) is %s', (t, ok) =>
  expect(isTime(t)).toBe(ok));
it('lets a tiny or very large real baby through that no guess could be', () => {
  expect(realBirthProblem(b('2027-02-01', '04:10', 20, 9))).toBeNull();
  expect(guessBirthProblem(b(due, '04:10', 20, 20), due)).toBe('Pick a weight between 2 lb 0 oz and 14 lb 15 oz.');
  expect(realBirthProblem(b(due, '04:10', 7, 20))).toBe('The real weight must be between 0 lb 8 oz and 20 lb 0 oz.');
  expect(realBirthProblem(b(due, '04:10', 120, 33))).toBe('The real length must be between 8 and 32 in, in half inches.');
});
it('scores time of day around midnight', () => {
  const real = b(due, '23:58', 120, 20);
  expect(birthDistance('time', b(due, '23:50', 120, 20), real)).toBe(8);
  expect(birthDistance('time', b(due, '02:00', 120, 20), real)).toBe(122);
});
it('shares a tie between guesses on either side, alphabetically, and skips Guesses without Birth Details', () => {
  const real = b('2027-04-04', '03:12', 121, 20.5);
  const winners = closestWinners([
    { guesser: 'Mom', birth: b('2027-04-05', '03:00', 120, 20) },
    { guesser: 'Grandma Jo', birth: b('2027-04-03', '04:00', 128, 21) },
    { guesser: 'Old Guess' },
  ], real);
  expect(winners.date).toEqual(['Grandma Jo', 'Mom']);
  expect(winners.time).toEqual(['Mom']);
  expect(winners.weight).toEqual(['Mom']);
  expect(winners.length).toEqual(['Grandma Jo', 'Mom']);
  expect(closestWinners([], real)).toEqual({ date: [], time: [], weight: [], length: [] });
});
it('formats every value the way the copy says', () => {
  expect(formatBirthDetails(b('2027-04-05', '15:20', 120, 20.5))).toBe('Apr 5 at 3:20 pm · 7 lb 8 oz · 20½ in');
  expect(formatBirthValue('time', b(due, '12:00', 120, 20))).toBe('12:00 pm');
  expect(formatBirthValue('time', b(due, '00:05', 120, 20))).toBe('12:05 am');
  expect(formatBirthValue('length', b(due, '12:00', 120, 20))).toBe('20 in');
  expect(formatBirthValue('weight', b(due, '12:00', 8, 20))).toBe('0 lb 8 oz');
  expect(formatLongDay('2027-04-03')).toBe('April 3');
  expect(formatShortDay('2027-12-31')).toBe('Dec 31');
});
it('shows the same date to a viewer in another time zone', () => {
  const tz = process.env.TZ;
  process.env.TZ = 'America/Los_Angeles'; // Node applies a changed TZ immediately
  try {
    expect(formatShortDay('2027-04-05')).toBe('Apr 5');
    expect(formatBirthDetails(b('2027-04-05', '00:30', 120, 20))).toBe('Apr 5 at 12:30 am · 7 lb 8 oz · 20 in');
  } finally {
    process.env.TZ = tz;
  }
});
```

  (`r && message` means: `null` when `r` is `null`, otherwise that message.)
- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/birth.test.ts`. Expected: FAIL, the module isn't found.
- [ ] **Step 3: Implement `_lib/birth.ts`** per the Interfaces block. Format `Day`s by splitting the string and indexing a month-name table; don't use `Date` there. `birthValue('date')` may use `daysBetween('1970-01-01', day)`.
- [ ] **Step 4: Run the tests to verify they pass.** Same command, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/pages/lab/baby-guess/_lib/birth.ts src/pages/lab/baby-guess/_lib/birth.test.ts && git commit -m "feat(baby-guess): Birth Details rules"`

---

### Task 2: Guesses and the Reveal carry Birth Details

**Files:**
- Modify: `<proj>/_lib/game.ts`, `<proj>/_lib/store.ts`, `<proj>/_lib/schemas.ts`, `<proj>/_lib/actions.ts`
- Test: `<proj>/_lib/schemas.test.ts`, `<proj>/_lib/store.test.ts`, `<proj>/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `BirthDetails`, `isTime`, `guessBirthProblem`, `realBirthProblem` (Task 1).
- Produces:
  - `game.ts`:
    - `Guess` gains `birth?: BirthDetails` (absent on Guesses stored before this feature);
    - `Game.reveal` becomes `{ first: string; middle: string; at: string; birth: BirthDetails }`.
  - `store.ts`: `NewGuess` gains `birth: BirthDetails`. The stored hash value is the whole object, so there's no logic change.
  - `schemas.ts`:
    - `birthSchema = z.object({ date: day, time: z.string().refine(isTime, 'Pick a time of birth.'), weightOz: z.number().int(), lengthIn: z.number() })`;
    - `guessSchema` and `revealSchema` both gain `birth: birthSchema`.
  - `actions.ts`:
    - `GuessInput` gains `birth: BirthDetails`.
    - `submitGuess` runs, after its phase checks and before `addGuess`: `const problem = guessBirthProblem(input.birth, game.dueDate)`, and a problem throws `HttpError(400, problem)`. It stores `birth` and returns `{ guesser, first, middle, birth }`.
    - New `export interface RevealInput { first: string; middle: string; birth: BirthDetails }`. `revealAnswer(deps, input: RevealInput)` runs, after the name checks, `realBirthProblem(input.birth)` (a problem is a 400), then saves `reveal: { first, middle, at, birth: input.birth }`.
  - Routes: `api/guess.ts` and `api/host/reveal.ts` already pass the parsed body through unchanged, so they need no edit.

- [ ] **Step 1: Bring the existing tests along.**
  - In `actions.test.ts`, give every `submitGuess` input `birth: BIRTH` and every `revealAnswer` input `birth: REAL`, where `BIRTH = { date: '2027-01-20', time: '12:00', weightOz: 120, lengthIn: 20 }` matches the file's `baseGame.dueDate` and `REAL` is a valid real value. Do the same in `schemas.test.ts` for `guessSchema` cases.
  - Run `npm test`. Expected: still green, because nothing reads `birth` yet.
- [ ] **Step 2: Write the failing tests.**

```ts
// schemas.test.ts
it('needs a well-formed birth with every Guess and Reveal', () => {
  const birth = { date: '2027-04-05', time: '15:20', weightOz: 120, lengthIn: 20.5 };
  expect(guessSchema.safeParse({ guesser: 'Mom', first: 'Ava', middle: 'Rose', birth }).success).toBe(true);
  expect(guessSchema.safeParse({ guesser: 'Mom', first: 'Ava', middle: 'Rose' }).success).toBe(false);
  expect(guessSchema.safeParse({ guesser: 'Mom', first: 'Ava', middle: 'Rose', birth: { ...birth, time: '3:20 pm' } }).success).toBe(false);
  expect(revealSchema.safeParse({ first: 'ava', middle: 'rose', birth: { ...birth, weightOz: '120' } }).success).toBe(false);
});
// store.test.ts
it('keeps a Guess’s Birth Details', async () => { /* addGuess with birth → load().guesses[0].birth toEqual it */ });
// actions.test.ts (game dueDate '2027-04-03' for these)
it('refuses a guessed birth date outside the window with the window in the message', async () => { /* birth.date '2027-05-04' → 400 'Pick a birth date between Mar 4 and May 3.' */ });
it('checks the window against the Due Date when the Guess is sent, keeping earlier Guesses', async () => {
  // Guess A with date '2027-05-01' accepted under due 04-03; saveConfig dueDate '2027-03-15';
  // Guess B with '2027-05-01' now refused (400); load().guesses still holds A with its birth
});
it('stores and returns the Birth Details with the Guess', async () => { /* return value and load() both carry birth */ });
it('reveals a tiny baby and keeps the real Birth Details', async () => {
  // revealAnswer({ first, middle, birth: { date: '2027-02-01', time: '04:10', weightOz: 20, lengthIn: 9 } }) resolves;
  // load().game.reveal.birth toEqual that birth
});
it('refuses a real weight outside 0 lb 8 oz – 20 lb 0 oz', async () => { /* weightOz 7 → 400 'The real weight must be between 0 lb 8 oz and 20 lb 0 oz.' */ });
```

  Write the commented bodies out in full.
- [ ] **Step 3: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/schemas.test.ts src/pages/lab/baby-guess/_lib/store.test.ts src/pages/lab/baby-guess/_lib/actions.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 4: Implement** per the Interfaces block.
- [ ] **Step 5: Run the tests to verify they pass.** Same command, then `npm test`. Expected: PASS.
- [ ] **Step 6: Commit.** `git add src/pages/lab/baby-guess/_lib && git commit -m "feat(baby-guess): Guesses and the Reveal carry Birth Details"`

---

### Task 3: Public and Host projections

**Files:**
- Modify: `<proj>/_lib/project.ts`
- Test: `<proj>/_lib/project.test.ts`

**Interfaces:**
- Consumes: `BirthDetails`, `BirthCategory`, `closestWinners` (Task 1); `Guess.birth` and `Game.reveal.birth` (Task 2).
- Produces (`PublicState` changes; keys are built in this order):
  - `guessing`: `{ phase, lastGuessDay, dueDate, hints, count }`.
  - `revealed`:
    - `guesses` entries become `{ guesser, first, middle, birth? }`, with `birth` present only when the Guess has it;
    - a new last key `birth: { real: BirthDetails; winners: Record<BirthCategory, string[]> }`, where `winners = closestWinners(data.guesses, reveal.birth)`.
  - `boards` and `setup`: unchanged.
  - `hostState`: unchanged, since its `guesses` already include `birth`.

- [ ] **Step 1: Write the failing tests.** Give the fixture's Guesses Birth Details, leaving one without, and give its Reveal a `birth`.

```ts
it('guessing shows the Due Date, so the form can set its date range', () =>
  expect(publicState(fixture(), '2027-01-03')).toEqual({ phase: 'guessing', lastGuessDay: '2027-01-05', dueDate: '2027-01-20', hints, count: 10 }));
it('carries no Birth Details anywhere before the Reveal', () => {
  for (const day of ['2027-01-03', '2027-01-12']) {
    const text = JSON.stringify(publicState(lockedFixture('2027-01-06'), day));
    for (const word of ['birth', 'weightOz', 'lengthIn', '"time"']) expect(text).not.toContain(word);
  }
});
it('after the Reveal, shows the real Birth Details, each category’s Closest Winners and everyone’s guesses', () => {
  // state.birth.real toEqual the Reveal's birth; state.birth.winners matches closestWinners over the fixture's Guesses;
  // the Guess without Birth Details appears in `guesses` without a `birth` key and in no winners list;
  // no Decoy name appears in state.birth or state.guesses
});
```

  Write the last body out in full, with literal winner names worked out from your fixture.
- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/project.test.ts`. Expected: the new tests FAIL. The old exact `guessing` assertion also fails until it gains `dueDate`; update it in this step.
- [ ] **Step 3: Implement** per the Interfaces block.
- [ ] **Step 4: Run the tests to verify they pass.** Same command, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/pages/lab/baby-guess/_lib && git commit -m "feat(baby-guess): Birth Details in the public and Host state"`

---

### Task 4: The Guess form asks for Birth Details

**Files:**
- Modify: `<proj>/index.astro` (form markup, `renderGuessing`, `sendGuess`, `showGuessDone`, `GUESS_FIELD_LABEL`), `<proj>/_lib/client.ts`
- Test: `<proj>/_lib/client.test.ts`

**Interfaces:**
- Consumes: `formatBirthDetails`, `formatLongDay` (Task 1); `PublicState` `guessing.dueDate` (Task 3); `GuessInput.birth` (Task 2, type only).
- Produces:
  - `client.ts`: `recallGuess` accepts a remembered Guess with or without `birth`. A present `birth` must have string `date`/`time` and number `weightOz`/`lengthIn`, otherwise the whole thing is `null`.
  - The form. Under the middle-name field, a `fieldset` with the legend "Birth details" holds:

    | Control | Detail |
    |---|---|
    | "Birth date" | `<input type="date" id="birth-date" required>`, with help text "Due {formatLongDay(dueDate)}" under the label (e.g. "Due April 3"). `renderGuessing` sets `min`, `max`, `value` and `defaultValue` from `dueDate ± 30`, so "Guess for someone else" (which calls `form.reset()`) restores it. |
    | "Time of birth" | `<input type="time" id="birth-time" required value="12:00">` |
    | "Weight" | `<select id="birth-lb">` with options 2–14, `7` selected, labelled "7 lb"; and `<select id="birth-oz">` with options 0–15, `8` selected, labelled "8 oz". |
    | "Length" | `<select id="birth-length">` with options 12, 12.5 … 26, `20` selected, labelled "20 in" / "20½ in". |

  - The POST body adds `birth: { date, time, weightOz: lb * 16 + oz, lengthIn: Number(length) }`.
  - `GUESS_FIELD_LABEL` adds `'birth.date': 'Birth date: '`, `'birth.time': 'Time of birth: '`, `'birth.weightOz': 'Weight: '` and `'birth.lengthIn': 'Length: '`.
  - `showGuessDone` shows `Your guess: {first} {middle} · {formatBirthDetails(birth)}`, or just the name when `birth` is absent.

- [ ] **Step 1: Write the failing tests** in `client.test.ts`.

```ts
it('round-trips a remembered Guess with Birth Details', () => { /* rememberGuess(…birth) → recallGuess toEqual it */ });
it('still recalls a Guess remembered before Birth Details', () => { /* stored JSON without birth → recalled without birth */ });
it('rejects a remembered Guess with a malformed birth', () => {
  // { guesser, first, middle, birth: { date: '2027-04-05', time: '15:20', weightOz: '120', lengthIn: 20 } } → null
});
```

- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/client.test.ts`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement `client.ts`, then the form, `renderGuessing`, `sendGuess`, `showGuessDone` and `GUESS_FIELD_LABEL`** per the Interfaces block. All controls use the existing input styling (`rounded-lg border px-3 py-2`, `var(--gone)` border, `var(--card)` background). Weight's two dropdowns sit side by side.
- [ ] **Step 4: Run the tests to verify they pass.** Same command, then `npm test` and `npm run build`. Expected: PASS, and the build passes, including `check-og`.
- [ ] **Step 5: Commit.** `git add src/pages/lab/baby-guess && git commit -m "feat(baby-guess): the Guess form asks for Birth Details"`

---

### Task 5: Results: Closest Winners, charts and table columns

**Files:**
- Create: `<proj>/_lib/strip.ts`
- Test: `<proj>/_lib/strip.test.ts`
- Modify: `<proj>/index.astro` (the `revealed` section and `renderRevealed`)

**Interfaces:**
- Consumes: `BIRTH_CATEGORIES`, `birthValue`, `formatBirthValue`, `formatBirthDetails` (Task 1); `PublicState` `revealed.birth` and `guesses[].birth` (Task 3).
- Produces (`_lib/strip.ts`):

```ts
export interface StripPoint { label: string; value: number }
export interface StripDot extends StripPoint { x: number; level: number }   // level 0 = bottom of a stack
export interface StripLayout { dots: StripDot[]; realX: number; min: number; max: number; levels: number }
export function stripLayout(points: readonly StripPoint[], real: number, options: { width: number; padding?: number; domain?: [number, number] }): StripLayout;
```

- **Domain:** `options.domain`, or else the min/max over every point and `real`, widened by 1 on each side when they're equal.
- **Position:** `x = padding + (value − min) / (max − min) × (width − 2 × padding)`, with `padding` defaulting to 12.
- **Stacking:** equal values stack as levels 0, 1, 2…, in `label.localeCompare` order.
- **Levels:** `levels` is the highest level + 1, or 0 with no points.

**Results section**, rendered after the Partial Winners with DOM nodes only:
- A heading "Birth details", then the line `Born {formatBirthDetails(real)}`.
- **One block per category** in `BIRTH_CATEGORIES` order:
  - **Title:** "Closest birth date", "Closest time of birth", "Closest weight" or "Closest length".
  - **Winners line:** `{Guesser} ({their value})` for each Closest Winner, joined by `, `. With no winners, the line reads `Nobody guessed the birth details.`
  - **Chart:** an SVG strip chart following the Global Constraints' chart marks, using `stripLayout` with the container's `clientWidth` (fallback 340). Use `domain: [0, 1440]` for time.
    - Height: 20 + `levels × 10` + 30.
    - Dots sit on a baseline, stacked upward 10 px per level.
    - The real marker is a vertical line through the dot band, labelled `Born {value}` above it, with the label clamped inside the SVG.
    - The axis end labels show `formatBirthValue` of the min and max. For time they read "12 am".
- **"Everyone's guesses" table:** gains the columns "Date", "Time", "Weight" and "Length", using `formatBirthValue`, with "—" when `birth` is absent.

- [ ] **Step 1: Write the failing tests** in `strip.test.ts`.

```ts
it('spans every guess and the real value', () => {
  const layout = stripLayout([{ label: 'A', value: 10 }, { label: 'B', value: 30 }], 20, { width: 124 });
  expect([layout.min, layout.max]).toEqual([10, 30]);
  expect(layout.dots.map((d) => d.x)).toEqual([12, 112]);
  expect(layout.realX).toBe(62);
});
it('stacks equal values alphabetically', () => {
  const layout = stripLayout([{ label: 'Mom', value: 5 }, { label: 'Dad', value: 5 }, { label: 'Ava', value: 6 }], 5, { width: 100 });
  expect(layout.dots.filter((d) => d.value === 5).map((d) => [d.label, d.level])).toEqual([['Dad', 0], ['Mom', 1]]);
  expect(layout.levels).toBe(2);
});
it('uses a fixed domain when given (time of day)', () => {
  const layout = stripLayout([{ label: 'A', value: 720 }], 0, { width: 124, domain: [0, 1440] });
  expect(layout.dots[0].x).toBe(62);
  expect(layout.realX).toBe(12);
});
it('widens a single-value domain so nothing divides by zero', () => {
  expect(stripLayout([{ label: 'A', value: 7 }], 7, { width: 100 })).toMatchObject({ min: 6, max: 8 });
});
```

- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/strip.test.ts`. Expected: FAIL, the module isn't found.
- [ ] **Step 3: Implement `strip.ts`, then the results section and table columns** per the Interfaces block. Keep the chart CSS in `_components/baby.css`, Safari-14-safe.
- [ ] **Step 4: Run the tests to verify they pass.** Same command, then `npm test` and `npm run build`. Expected: PASS, and the build passes.
- [ ] **Step 5: Commit.** `git add src/pages/lab/baby-guess && git commit -m "feat(baby-guess): Birth Details results with strip charts"`

---

### Task 6: The Host page: Birth Details in the Guesses table and the Reveal

**Files:**
- Modify: `<proj>/host/index.astro`

**Interfaces:**
- Consumes: `formatBirthDetails`, `formatBirthValue` (Task 1); `HostState.guesses[].birth` (Task 2); the reveal body `{ first, middle, birth }` (Task 2).
- Produces:
  - **Guesses table:** the submission-time column header becomes "Sent". A new "Birth details" column shows `formatBirthDetails(birth)`, or "—".
  - **Reveal form:** after the two Answer selects, add these controls. All start empty, so nothing is ever revealed by default:

    | Control | Detail |
    |---|---|
    | birth date | `<input type="date" id="reveal-birth-date">`, with no min or max |
    | time | `<input type="time" id="reveal-birth-time">` |
    | lb | `<select id="reveal-birth-lb">` with a placeholder option "lb" (value `""`), then 0–20 |
    | oz | `<select id="reveal-birth-oz">` with "oz", then 0–15 |
    | length | `<select id="reveal-birth-length">` with "in", then 8, 8.5 … 32 |

  - **Before confirming:** if any of the five is empty, show `Enter all four birth details.` in `#reveal-error` and stop.
  - **Confirm copy:** `` `Reveal ${firstName} ${middleName}, born ${date} at ${time}, ${weight}, ${length}? This ends the game.` ``, using `formatBirthValue` for the four values. For example: "Reveal Olivia Rose, born Apr 4 at 3:12 am, 7 lb 9 oz, 20½ in? This ends the game."
  - **Request:** `doReveal(first, middle, birth)` posts `{ first, middle, birth }`.

- [ ] **Step 1: Implement** per the Interfaces block, following the page's existing patterns (DOM-only rendering, the in-flight button guard, error lines).
- [ ] **Step 2: Build.** Run `npm test && npm run build`. Expected: PASS.
- [ ] **Step 3: Commit.** `git add src/pages/lab/baby-guess/host && git commit -m "feat(baby-guess): Host page enters the real Birth Details at the Reveal"`

---

### Task 7: Docs and an end-to-end run on `dev:local`

**Files:**
- Modify:
  - `docs/superpowers/specs/2026-11-18-baby-guess-design.md`: §1 Guesses gets one line, "A Guess also includes Birth Details — see 2026-11-19-baby-guess-birth-details-design.md". §2 gets one line, "Before the Reveal it must also never contain Birth Details".
  - `CLAUDE.md`: the baby-guess Projects entry adds "+ Birth Details (date, time, weight, length; closest wins)".

- [ ] **Step 1: Update the two docs** as listed.
- [ ] **Step 2: Restart the local server with a throwaway token.** This wipes any local test game.
  - Run `npx astro dev stop; pkill -f scripts/dev-kv.mjs`.
  - Then run `BABY_GUESS_HOST_TOKEN=e2e-local-token npm run dev:local` in the background.
- [ ] **Step 3: Play a short game with `curl`** against `http://localhost:4321/lab/baby-guess/api` (`H='authorization: Bearer e2e-local-token'`):
  1. `host/config` with today as the last guessing day, `dueDate: '2027-04-03'` and two Hints. Then `state` shows `dueDate: "2027-04-03"`.
  2. Three `guess` POSTs with Birth Details. Then a fourth with `date: '2027-05-04'`, which gets 400 `Pick a birth date between Mar 4 and May 3.`
  3. Set the last guessing day to yesterday, lock with the defaults, then `host/reveal` with a real `birth`.
  4. `state` now shows `phase: "revealed"`, `birth.real` and `birth.winners` matching the guesses, and each `guesses[].birth`.
  5. Before the Reveal, the `boards`-phase `state` contained no `birth`.
- [ ] **Step 4: Look at it.** Open http://localhost:4321/lab/baby-guess/ at phone width (headless Chrome screenshot into a 375 px iframe is fine). Check:
  - the results section's winner lines;
  - the four charts, for overlap, the clamped "Born …" label and the axis ends;
  - the table's new columns.

  Then confirm the Host page's Reveal controls start empty.
- [ ] **Step 5: Commit.** `git add docs CLAUDE.md && git commit -m "docs(baby-guess): Birth Details in the spec and CLAUDE.md"`
