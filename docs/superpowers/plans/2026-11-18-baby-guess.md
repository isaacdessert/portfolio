# Baby Guess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the baby-name guessing game as an unlisted lab project at `baby-guess.isaacdessert.dev`.

**Architecture:** Two static Astro pages, the Guesser page and the Host page, fetch JSON from
on-demand API routes under `/lab/baby-guess/api/`. Every game rule lives in pure, test-first
`_lib/` modules: names, days, pacing, game and project. They are fed by a thin Redis store, built
on `kv()` plus new hash commands, and a thin actions layer. Route files only rate-limit,
authenticate, validate and call an action.

**Tech Stack:**
- Astro 7.3.5, static, with `@astrojs/vercel` 11
- TypeScript
- zod 4, via `astro/zod`
- `@upstash/redis` 1.39, through `@lab/kv`
- Vitest 4
- Tailwind 3
- `@fontsource/nunito` (new dependency)
- `sharp` 0.35 (already installed), for a one-off OG PNG

**Spec:** `docs/superpowers/specs/2026-11-18-baby-guess-design.md`. Terms are in `GLOSSARY.md`.

## Global Constraints

- **Project:** slug `baby-guess`, folder `src/pages/lab/baby-guess/` (called `<proj>` below), `_meta.ts` `status: 'unlisted'`.
- **Isolation:** project files import only their own folder, `@lab/*`, or npm packages. `npm test` enforces this.
- **Links:** links and fetches use `labUrl('baby-guess', path)`, never relative paths.
- **No on-demand pages:** only `api/**` files have `export const prerender = false`.
- **API routes:** every one is wrapped in `handler()`. Bodies are JSON, read with `readBody(request, schema)`, and schemas use `import { z } from 'astro/zod'`. Every response carries `cache-control: no-store`.
- **Rate limits per IP** (`rateLimit` ids in quotes):
  - `api/state`: `'state'` 60 / `'1 m'`
  - `api/guess`: `'guess'` 20 / `'10 m'`
  - every `api/host/*`: `'host'` 30 / `'1 m'`
- **Host secret:** env var `BABY_GUESS_HOST_TOKEN`, sent as `Authorization: Bearer <token>`.
- **Days:** a Day is `YYYY-MM-DD` in `America/Chicago`, and every boundary is midnight Central.
- **Redis keys:** `lab:baby-guess:<keySpace>:guesses | :decoys | :game`, where `keySpace` = `VERCEL_ENV` or `'development'`.
- **Fixed copy (409):** `Someone named <name> already guessed. Add your last initial.`
- **Secrecy:** the rules in spec §2 hold for every public response before the Reveal.
- **Ordering:** Candidates are listed alphabetically (normalised key, `localeCompare`), never by count.
- **No `innerHTML` with user data:** names come from strangers. Render with `textContent` or DOM APIs only.
- **Vocabulary:** use `GLOSSARY.md` terms in identifiers, test names and copy. Board ids are `'first' | 'middle'`.

## Review Focus

1. **Same name at the same moment.** Two people submitting "Mom" at once (a group-chat link drop) store exactly one Guess, and the other gets the 409 copy. *Tests: Task 6, Task 7.*
2. **The Deadline is Central, not UTC.** A Guess at 11:59 pm Central on the last guessing day is accepted; one at 12:00 am Central is refused, even though the server clock is UTC. *Test: Task 7.*
3. **Phone keyboards.** Curly apostrophes, accents, doubled or trailing spaces and ALL CAPS ("O’Brien ", "o'brien", "ZOË", "zoe") land on one Candidate with a sensible display spelling. *Tests: Task 2, Task 4.*
4. **Host picks in display form.** The Host's Final Five picks and Reveal can arrive as typed ("Olivia", "olivia ", "ROSE") and must hit the same Candidate keys. *Tests: Task 4, Task 7.*
5. **No browser storage** (private mode, blocked site data). Guessing still works; only the "your Guess" echo is missing. *Test: Task 9.*

---

### Task 1: Hash commands in the shared `kv()`

**Files:**
- Modify: `src/lab/kv.ts` (`RedisLike`, `LabKv`, `createKv`)
- Test: `src/lab/kv.test.ts`
- Modify: `CLAUDE.md` (Lab platform → "State:" bullet)

**Interfaces:**
- Produces on `LabKv` (all keys prefixed `lab:<slug>:` like the existing methods):
  - `hsetnx(key: string, field: string, value: unknown): Promise<boolean>`: true when the field was new.
  - `hgetall<T = unknown>(key: string): Promise<Record<string, T>>`: `{}` when Redis returns `null`.
  - `hdel(key: string, field: string): Promise<void>`
- Adds to `RedisLike`:
  - `hsetnx(key: string, field: string, value: unknown): Promise<0 | 1>`
  - `hgetall<T extends Record<string, unknown>>(key: string): Promise<T | null>`
  - `hdel(key: string, ...fields: string[]): Promise<number>`

- [ ] **Step 1: Write the failing tests.** Add `hsetnx: vi.fn(async () => 1)`, `hgetall: vi.fn(async () => ({ a: 1 }))` and `hdel: vi.fn(async () => 1)` to `fakeRedis()`, then:

```ts
it('prefixes hash keys with lab:<slug>:', async () => {
  const redis = fakeRedis();
  const store = createKv('hello', asClient(redis));
  expect(await store.hsetnx('guesses', 'mom', { first: 'Ava' })).toBe(true);
  expect(await store.hgetall('guesses')).toEqual({ a: 1 });
  await store.hdel('guesses', 'mom');
  expect(redis.hsetnx).toHaveBeenCalledWith('lab:hello:guesses', 'mom', { first: 'Ava' });
  expect(redis.hgetall).toHaveBeenCalledWith('lab:hello:guesses');
  expect(redis.hdel).toHaveBeenCalledWith('lab:hello:guesses', 'mom');
});
it('reports an existing hash field as false', async () => {
  const redis = fakeRedis();
  redis.hsetnx.mockResolvedValueOnce(0);
  expect(await createKv('hello', asClient(redis)).hsetnx('g', 'mom', 1)).toBe(false);
});
it('returns {} for a missing hash', async () => {
  const redis = fakeRedis();
  redis.hgetall.mockResolvedValueOnce(null);
  expect(await createKv('hello', asClient(redis)).hgetall('g')).toEqual({});
});
```

- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/lab/kv.test.ts`. Expected: FAIL, `store.hsetnx is not a function`.
- [ ] **Step 3: Implement the three methods in `createKv`.** The `getRedis as () => RedisLike` cast in `kv()` already covers the real client, whose `hsetnx`/`hgetall`/`hdel` match these shapes.
- [ ] **Step 4: Run the tests to verify they pass.** Run `npx vitest run src/lab/kv.test.ts`, then `npm test`. Expected: all PASS.
- [ ] **Step 5: Update `CLAUDE.md`.** Change the bullet to: ``- State: `kv('<slug>')` — keys auto-prefixed `lab:<slug>:`; `get/set/incr/del/expire` plus hash `hsetnx/hgetall/hdel`.``
- [ ] **Step 6: Commit.** `git add src/lab/kv.ts src/lab/kv.test.ts CLAUDE.md && git commit -m "feat(lab): hash commands in kv()"`

---

### Task 2: Scaffold the project; name rules

**Files:**
- Create (scaffold): `<proj>/_meta.ts`, `<proj>/index.astro` (placeholder, replaced in Task 9)
- Create: `<proj>/_lib/names.ts`
- Test: `<proj>/_lib/names.test.ts`

**Interfaces:**
- Produces (`_lib/names.ts`):
  - `cleanName(raw: string): string`: trims, collapses internal whitespace to one space, and turns `’` and `‘` into `'`.
  - `normalize(raw: string): string`: `cleanName`, then NFD, strip `\p{M}`, lowercase. This is the Candidate key and the Guesser id.
  - `displaySpelling(raw: string): string`: `cleanName`. Then, if the result is all-lower or all-upper, uppercase the first letter and every letter after a space, hyphen or apostrophe, and lowercase the rest. Otherwise it is returned unchanged.
  - `isNamePart(raw: string): boolean`: `cleanName(raw)` is 1–30 characters and matches `/^[\p{L}\p{M}' -]+$/u`.
  - `isGuesserName(raw: string): boolean`: `cleanName(raw)` is 1–50 characters with no `\p{Cc}`.

- [ ] **Step 1: Scaffold.** Run `npm run new baby-guess`. Then edit `_meta.ts` to: title `'Baby Guess'`, description `'Guess the baby’s first and middle name before guessing closes.'`, status `'unlisted'`, tags `['family']`, keeping the date the script wrote.
- [ ] **Step 2: Write the failing tests.**

```ts
describe('normalize', () => {
  it('ignores case and outer or repeated spaces', () => expect(normalize('  Mary   Kate ')).toBe('mary kate'));
  it('ignores accents', () => expect(normalize('Zoë')).toBe(normalize('ZOE')));
  it('treats curly and straight apostrophes alike', () => expect(normalize('O’Brien')).toBe("o'brien"));
  it('keeps spelling differences', () => expect(normalize('Aiden')).not.toBe(normalize('Aidan')));
});
describe('displaySpelling', () => {
  it('title-cases all-lower input', () => expect(displaySpelling('mary-kate')).toBe('Mary-Kate'));
  it('title-cases all-caps input', () => expect(displaySpelling("O'BRIEN")).toBe("O'Brien"));
  it('keeps deliberate mixed case', () => expect(displaySpelling('McKenzie')).toBe('McKenzie'));
  it('cleans spaces and apostrophes first', () => expect(displaySpelling(' o’brien ')).toBe("O'Brien"));
});
describe('isNamePart', () => {
  it.each(['Zoë', 'O’Brien', 'Mary-Kate', 'Mary Kate'])('accepts %s', (s) => expect(isNamePart(s)).toBe(true));
  it.each(['', '   ', 'R2D2', 'Ava!', 'a'.repeat(31)])('rejects %j', (s) => expect(isNamePart(s)).toBe(false));
});
describe('isGuesserName', () => {
  it.each(['Aunt May', 'Grandpa 🎉', 'x'.repeat(50)])('accepts %j', (s) => expect(isGuesserName(s)).toBe(true));
  it.each(['', '   ', 'x'.repeat(51), 'bad\u0007name'])('rejects %j', (s) => expect(isGuesserName(s)).toBe(false));
});
```

- [ ] **Step 3: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/names.test.ts`. Expected: FAIL, the module isn't found.
- [ ] **Step 4: Implement `_lib/names.ts`** per the Interfaces block.
- [ ] **Step 5: Run the tests to verify they pass.** Run the same file, then `npm test`. Expected: all PASS, including the registry and isolation tests, which now see the new project.
- [ ] **Step 6: Commit.** `git add src/pages/lab/baby-guess && git commit -m "feat(baby-guess): scaffold project and name rules"`

---

### Task 3: Central days and Elimination pacing

**Files:**
- Create: `<proj>/_lib/days.ts`, `<proj>/_lib/pacing.ts`
- Test: `<proj>/_lib/days.test.ts`, `<proj>/_lib/pacing.test.ts`

**Interfaces:**
- Produces (`_lib/days.ts`):
  - `type Day = string` (`YYYY-MM-DD`)
  - `centralDay(now: Date): Day`: `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })`.
  - `addDays(day: Day, n: number): Day`
  - `daysBetween(from: Day, to: Day): number`: `to − from`, using `Date.UTC` arithmetic.
  - `isDay(s: string): boolean`: the format and a real calendar date.
- Produces (`_lib/pacing.ts`):
  - `interface Anchor { day: Day; eliminated: number }`
  - `eliminatedCount(total: number, anchor: Anchor, dueDate: Day, today: Day): number`: the spec §1 *Pacing* formula exactly (`m = max(1, D − anchor.day)`, `R = total − anchor.eliminated`, `k = clamp(today − anchor.day, 0, m)`).
  - `reanchor(total: number, anchor: Anchor, oldDueDate: Day, today: Day): Anchor`: `{ day: today, eliminated: eliminatedCount(total, anchor, oldDueDate, today) }`.
  - `upcoming(total: number, anchor: Anchor, dueDate: Day, today: Day): { day: Day; count: number }[]`: each future day whose midnight Eliminates `count > 0` Candidates, in order.

- [ ] **Step 1: Write the failing tests.** In `days.test.ts`:

```ts
it('uses Central time, CST (UTC−6) in winter', () => {
  expect(centralDay(new Date('2026-11-19T05:59:59Z'))).toBe('2026-11-18');
  expect(centralDay(new Date('2026-11-19T06:00:00Z'))).toBe('2026-11-19');
});
it('uses CDT (UTC−5) in summer', () => {
  expect(centralDay(new Date('2027-06-01T04:59:59Z'))).toBe('2027-05-31');
  expect(centralDay(new Date('2027-06-01T05:00:00Z'))).toBe('2027-06-01');
});
it('adds days across month, year and DST boundaries', () => {
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(addDays('2027-03-13', 1)).toBe('2027-03-14');
});
it('counts days between', () => {
  expect(daysBetween('2026-12-31', '2027-01-02')).toBe(2);
  expect(daysBetween('2027-01-02', '2026-12-31')).toBe(-2);
});
it('validates days', () => {
  expect(isDay('2027-02-28')).toBe(true);
  expect(isDay('2027-02-30')).toBe(false);
  expect(isDay('2027-2-3')).toBe(false);
});
```

In `pacing.test.ts`, write local helpers: `days(from, to)` lists the Days inclusive, and
`deltas(total, anchor, due)` gives each day's Eliminations from `anchor.day + 1` through `due`.

```ts
const lock = { day: '2027-01-10', eliminated: 0 };
it('Eliminates one a day, landing on the Due Date, when there are fewer Candidates than days', () => {
  expect(days('2027-01-14', '2027-01-21').map((d) => eliminatedCount(6, lock, '2027-01-20', d)))
    .toEqual([0, 1, 2, 3, 4, 5, 6, 6]);
});
it('spreads the extras evenly when there are more Candidates than days', () => {
  expect(deltas(12, lock, '2027-01-20')).toEqual([1, 1, 1, 1, 2, 1, 1, 1, 1, 2]);
});
it('Eliminates nothing on the lock day', () => {
  expect(eliminatedCount(12, lock, '2027-01-20', '2027-01-10')).toBe(0);
});
it('Eliminates everything at the next midnight when locked on the Due Date', () => {
  const late = { day: '2027-01-20', eliminated: 0 };
  expect(eliminatedCount(4, late, '2027-01-20', '2027-01-20')).toBe(0);
  expect(eliminatedCount(4, late, '2027-01-20', '2027-01-21')).toBe(4);
});
it('re-spreads what is left when the Due Date moves earlier', () => {
  const a = reanchor(12, lock, '2027-01-20', '2027-01-13');
  expect(a).toEqual({ day: '2027-01-13', eliminated: 3 });
  expect(days('2027-01-13', '2027-01-16').map((d) => eliminatedCount(12, a, '2027-01-16', d)))
    .toEqual([3, 6, 9, 12]);
});
it('waits, then goes one a day, when the Due Date moves later', () => {
  const a = reanchor(12, lock, '2027-01-20', '2027-01-13');
  expect(eliminatedCount(12, a, '2027-01-30', '2027-01-21')).toBe(3);
  expect(eliminatedCount(12, a, '2027-01-30', '2027-01-22')).toBe(4);
  expect(eliminatedCount(12, a, '2027-01-30', '2027-01-30')).toBe(12);
});
it('Eliminates the rest at the next midnight when the Due Date is already past', () => {
  const a = reanchor(12, lock, '2027-01-20', '2027-01-13');
  expect(eliminatedCount(12, a, '2027-01-12', '2027-01-13')).toBe(3);
  expect(eliminatedCount(12, a, '2027-01-12', '2027-01-14')).toBe(12);
});
it('never decreases and stays within 0…total', () => {
  for (let total = 0; total <= 30; total++)
    for (let offset = -3; offset <= 40; offset++) {
      const due = addDays(lock.day, offset);
      let prev = 0;
      for (const d of days(lock.day, addDays(due > lock.day ? due : lock.day, 5))) {
        const n = eliminatedCount(total, lock, due, d);
        expect(n).toBeGreaterThanOrEqual(prev);
        expect(n).toBeLessThanOrEqual(total);
        prev = n;
      }
    }
});
it('lists the upcoming Eliminations for the Host', () => {
  expect(upcoming(12, lock, '2027-01-20', '2027-01-18')).toEqual([
    { day: '2027-01-19', count: 1 },
    { day: '2027-01-20', count: 2 },
  ]);
  expect(upcoming(12, lock, '2027-01-20', '2027-01-20')).toEqual([]);
});
```

- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/days.test.ts src/pages/lab/baby-guess/_lib/pacing.test.ts`. Expected: FAIL, the modules aren't found.
- [ ] **Step 3: Implement `_lib/days.ts` and `_lib/pacing.ts`** per the Interfaces block.
- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/pages/lab/baby-guess/_lib && git commit -m "feat(baby-guess): Central days and Elimination pacing"`

---

### Task 4: Game rules

**Files:**
- Create: `<proj>/_lib/game.ts`
- Test: `<proj>/_lib/game.test.ts`

**Interfaces:**
- Consumes: `normalize`, `displaySpelling` (Task 2); `Day`, `centralDay` (Task 3); `Anchor`, `eliminatedCount` (Task 3); `HttpError` from `@lab/api`.
- Produces (`_lib/game.ts`):

```ts
export type BoardId = 'first' | 'middle';
export const BOARDS: readonly BoardId[] = ['first', 'middle'];
export interface Guess { id: string; guesser: string; first: string; middle: string; at: string } // id = normalize(guesser); at = ISO instant
export interface Decoy { id: string; first: string; middle: string; at: string }
export interface BoardLock { finalFive: string[]; order: string[]; anchor: Anchor }            // Candidate keys
export interface Game {
  lastGuessDay: Day;
  dueDate: Day;
  hints: Record<BoardId, string>;
  lock?: { day: Day; boards: Record<BoardId, BoardLock> };
  reveal?: { first: string; middle: string; at: string };                                      // Candidate keys
}
export interface GameData { game: Game | null; guesses: Guess[]; decoys: Decoy[] }
export type Phase = 'setup' | 'guessing' | 'boards' | 'revealed';
export interface Candidate { key: string; name: string; guesses: number; decoys: number }

export function phaseOf(game: Game | null, today: Day): Phase;
export function boardCandidates(data: Pick<GameData, 'guesses' | 'decoys'>, board: BoardId): Candidate[];
export function eliminatedKeys(game: Game, board: BoardId, today: Day): Set<string>;
export function defaultFinalFive(candidates: Candidate[]): string[];
export function shuffle<T>(items: readonly T[], random: () => number): T[];
export function buildLock(data: GameData, picks: Record<BoardId, string[]>, today: Day, random: () => number): NonNullable<Game['lock']>;
export function results(guesses: Guess[], answer: Record<BoardId, string>): { winners: string[]; partialWinners: { guesser: string; matched: BoardId }[] };
```

- `phaseOf`:
  - `reveal` set → `'revealed'`
  - no game → `'setup'`
  - `today ≤ lastGuessDay` → `'guessing'`
  - otherwise → `'boards'`
- `boardCandidates`:
  - groups by `normalize(entry[board])`;
  - `name` = `displaySpelling` of the earliest backer by `at` (on a tie, Guesses before Decoys);
  - sorted by `key.localeCompare`.
- `eliminatedKeys`:
  - empty without a lock;
  - otherwise the first `eliminatedCount(order.length, anchor, game.dueDate, asOf)` keys of the order;
  - `asOf` = `today`, or after a Reveal the earlier of `today` and `centralDay(new Date(reveal.at))`, which freezes the Boards at the Reveal.
- `defaultFinalFive`: top 5 by `guesses` (Decoys don't count), ties alphabetical by key.
- `shuffle`: Fisher–Yates from the end, `j = Math.floor(random() * (i + 1))`. It doesn't mutate its input.
- `buildLock`:
  - normalises every pick;
  - requires exactly 5 distinct existing keys per Board, else `HttpError(400, 'Pick 5 different Candidates on the first-name Board')` (or `middle-name`);
  - `order` = `shuffle` of that Board's other keys;
  - `anchor` = `{ day: today, eliminated: 0 }`.
- `results`:
  - compares `normalize(guess.first)` with `answer.first`, and `middle` with `answer.middle`;
  - both match → Winner; exactly one → Partial Winner with `matched`;
  - both lists are sorted by `guesser.localeCompare`.

- [ ] **Step 1: Write the failing tests.** Use a local `guess(guesser, first, middle, at)` builder that sets `id: normalize(guesser)`.

```ts
describe('phaseOf', () => {
  const game = { lastGuessDay: '2027-01-05', dueDate: '2027-01-20', hints: { first: 'a', middle: 'b' } };
  it('is setup with no game', () => expect(phaseOf(null, '2027-01-01')).toBe('setup'));
  it('is guessing through the last guessing day', () => expect(phaseOf(game, '2027-01-05')).toBe('guessing'));
  it('is boards after it', () => expect(phaseOf(game, '2027-01-06')).toBe('boards'));
  it('is revealed once revealed, even mid-guessing', () =>
    expect(phaseOf({ ...game, reveal: { first: 'ava', middle: 'rose', at: '2027-01-02T12:00:00Z' } }, '2027-01-02')).toBe('revealed'));
});
describe('boardCandidates', () => {
  it('groups case, spacing, apostrophe and accent variants into one Candidate', () => {
    const data = {
      guesses: [guess('A', 'O’Brien ', 'X', '2027-01-01T10:00:00Z'), guess('B', "o'brien", 'Y', '2027-01-01T11:00:00Z')],
      decoys: [{ id: 'd1', first: "O'BRIEN", middle: 'Z', at: '2027-01-01T09:00:00Z' }],
    };
    expect(boardCandidates(data, 'first')).toEqual([{ key: "o'brien", name: "O'Brien", guesses: 2, decoys: 1 }]);
  });
  it('lists alphabetically, not by popularity', () => {
    const data = { guesses: [guess('A', 'Zoe', 'X', 't1'), guess('B', 'zoë', 'X', 't2'), guess('C', 'Ava', 'X', 't3')], decoys: [] };
    expect(boardCandidates(data, 'first').map((c) => c.key)).toEqual(['ava', 'zoe']);
  });
});
it('defaultFinalFive takes the top 5 by real Guesses, ties alphabetical', () => {
  const c = (key: string, guesses: number, decoys = 0) => ({ key, name: key, guesses, decoys });
  expect(defaultFinalFive([c('ava', 3), c('bea', 4), c('cal', 4), c('dot', 1, 9), c('eve', 5), c('fay', 3), c('gus', 2)]))
    .toEqual(['eve', 'bea', 'cal', 'ava', 'fay']);
});
it('shuffle is Fisher–Yates and leaves its input alone', () => {
  const input = ['a', 'b', 'c', 'd'];
  expect(shuffle(input, () => 0)).toEqual(['b', 'c', 'd', 'a']);
  expect(input).toEqual(['a', 'b', 'c', 'd']);
});
describe('buildLock', () => {
  // data: 7 distinct first names and 7 distinct middle names
  it('accepts picks in display form or any case and orders the rest', () => { /* picks like 'Olivia ', 'AVA' → finalFive holds their keys; order holds exactly the other 2 keys; anchor { day: today, eliminated: 0 } */ });
  it.each([['four picks'], ['a duplicate (Ava, ava )'], ['a name not on the Board']])('refuses %s with a 400 naming the Board', () => { /* status 400, message 'Pick 5 different Candidates on the first-name Board' */ });
});
describe('eliminatedKeys', () => {
  it('is empty before the lock', () => { /* … */ });
  it('never includes a Final Five member and covers the whole order on the Due Date', () => { /* … */ });
  it('freezes at the Reveal day', () => { /* set on reveal day + 5 equals set on reveal day */ });
});
it('results: exact match wins, one name in position is a Partial Win, swapped names get nothing', () => {
  const guesses = [guess('Mom', 'Olivia', 'Rose', 't'), guess('Dad', 'olivia', 'Grace', 't'), guess('Gran', 'Ava', 'ROSE', 't'), guess('Uncle', 'Rose', 'Olivia', 't')];
  expect(results(guesses, { first: 'olivia', middle: 'rose' })).toEqual({
    winners: ['Mom'],
    partialWinners: [{ guesser: 'Dad', matched: 'first' }, { guesser: 'Gran', matched: 'middle' }],
  });
});
```

The stubbed bodies above (`/* … */`) state their assertions in the comment. Write them out in full.

- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/game.test.ts`. Expected: FAIL, the module isn't found.
- [ ] **Step 3: Implement `_lib/game.ts`** per the Interfaces block.
- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/pages/lab/baby-guess/_lib && git commit -m "feat(baby-guess): game rules"`

---

### Task 5: Public and Host projections (the secrecy rules)

**Files:**
- Create: `<proj>/_lib/project.ts`
- Test: `<proj>/_lib/project.test.ts`

**Interfaces:**
- Consumes: everything in `game.ts` (Task 4); `upcoming` (Task 3); `displaySpelling` (Task 2).
- Produces (`_lib/project.ts`):

```ts
export interface PublicCandidate { name: string; eliminated: boolean }
export type PublicState =
  | { phase: 'setup' }
  | { phase: 'guessing'; lastGuessDay: Day; hints: Record<BoardId, string>; count: number }        // count = Guesses + Decoys
  | { phase: 'boards'; hints: Record<BoardId, string>; boards: Record<BoardId, PublicCandidate[]> }
  | {
      phase: 'revealed';
      hints: Record<BoardId, string>;
      boards: Record<BoardId, (PublicCandidate & { answer: boolean })[]>;
      answer: Record<BoardId, string>;                                                            // display names
      winners: string[];
      partialWinners: { guesser: string; matched: BoardId }[];
      guesses: { guesser: string; first: string; middle: string }[];                              // real Guesses only, displaySpelling, sorted by guesser
    };
export function publicState(data: GameData, today: Day): PublicState;

export interface HostCandidate extends Candidate { eliminated: boolean; finalFive: boolean }
export interface HostBoard { candidates: HostCandidate[]; defaultFinalFive: string[]; upcoming: { day: Day; count: number }[] }
export interface HostState {
  keySpace: string; today: Day; phase: Phase; game: Game | null;
  guesses: Guess[]; decoys: Decoy[]; boards: Record<BoardId, HostBoard>;
}
export function hostState(data: GameData, today: Day, keySpace: string): HostState;
```

`upcoming` is `[]` before the lock. Object keys are built in the order shown, because the tests compare `Object.keys`.

- [ ] **Step 1: Write the failing tests.**
  - **Fixture:** `lastGuessDay '2027-01-05'`, `dueDate '2027-01-20'`, Hints `{ first: 'Two syllables', middle: 'A family name' }`. It has 8 Guesses whose Guessers carry distinctive names (`'Guesser Alpha'` … `'Guesser Hotel'`) and 7+ distinct names per Board, plus 2 Decoys. The Answer is `Olivia Rose`, guessed by `'Guesser Alpha'`.

```ts
it('setup shows nothing', () => expect(publicState({ game: null, guesses: [], decoys: [] }, '2027-01-01')).toEqual({ phase: 'setup' }));
it('guessing shows the Hints and a count that includes Decoys', () =>
  expect(publicState(fixture(), '2027-01-03')).toEqual({ phase: 'guessing', lastGuessDay: '2027-01-05', hints, count: 10 }));
describe('secrecy before the Reveal', () => {
  // state = publicState(lockedFixture, '2027-01-12') — locked on 2027-01-06, mid-schedule
  it('has only phase, hints and boards', () => expect(Object.keys(state)).toEqual(['phase', 'hints', 'boards']));
  it('gives every Candidate exactly { name, eliminated }', () => {
    for (const b of BOARDS) for (const c of state.boards[b]) expect(Object.keys(c)).toEqual(['name', 'eliminated']);
  });
  it('leaks no Guesser, Decoy, count or lock detail', () => {
    const text = JSON.stringify(state);
    for (const word of ['Guesser', 'decoy', 'finalFive', 'order', 'anchor', 'dueDate', 'count', 'guesses'])
      expect(text).not.toContain(word);
  });
  it('lists alphabetically', () => { /* names per Board equal their sorted copy (localeCompare) */ });
});
it('plays a full timeline', () => {
  // 2027-01-01 … 01-05: phase 'guessing'; 01-06: 'boards', nothing Eliminated.
  // Lock on 01-06 (buildLock with seeded random). Each day 01-07 … 01-22: the Eliminated count never decreases;
  // a Final Five member is never Eliminated; from 01-20 on, the non-Eliminated names are exactly the Final Five.
  // Reveal at '2027-01-23T15:00:00Z' (first 'olivia', middle 'rose'): phase 'revealed'; winners ['Guesser Alpha'];
  // exactly one `answer: true` per Board; every Candidate's keys are ['name', 'eliminated', 'answer'];
  // `guesses` has 8 entries and no Decoy names.
});
it('an early Reveal before the lock shows nothing Eliminated', () => { /* reveal during guessing → 'revealed', all eliminated false */ });
it('hostState gives the Host counts, Decoys, defaults before the lock and the schedule after it', () => {
  // before lock: defaultFinalFive has 5 keys, upcoming []; after lock: finalFive flags match the lock, upcoming is non-empty; keySpace echoed
});
```

Write the commented bodies out in full.

- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/project.test.ts`. Expected: FAIL, the module isn't found.
- [ ] **Step 3: Implement `_lib/project.ts`** per the Interfaces block.
- [ ] **Step 4: Run the tests to verify they pass.** Same command. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/pages/lab/baby-guess/_lib && git commit -m "feat(baby-guess): public and Host state projections"`

---

### Task 6: Redis game store

**Files:**
- Create: `<proj>/_lib/store.ts`, `<proj>/_lib/__fixtures__/fakeKv.ts`
- Test: `<proj>/_lib/store.test.ts`

**Interfaces:**
- Consumes: `LabKv` hash methods (Task 1); `readEnv` from `@lab/api`; `normalize` (Task 2); `Game`, `GameData` (Task 4).
- Produces (`_lib/store.ts`):

```ts
export interface NewGuess { guesser: string; first: string; middle: string; at: string }
export interface NewDecoy { first: string; middle: string; at: string }
export interface GameStore {
  readonly keySpace: string;
  load(): Promise<GameData>;                    // fresh key space → { game: null, guesses: [], decoys: [] }
  addGuess(guess: NewGuess): Promise<boolean>;  // hsetnx on field normalize(guesser); false when taken
  addDecoy(decoy: NewDecoy): Promise<void>;     // field = newId()
  removeGuess(id: string): Promise<void>;
  removeDecoy(id: string): Promise<void>;
  saveGame(game: Game): Promise<void>;
}
export type HashKv = Pick<LabKv, 'get' | 'set' | 'hsetnx' | 'hgetall' | 'hdel'>;
export function createGameStore(kv: HashKv, keySpace: string, newId?: () => string): GameStore; // newId defaults to crypto.randomUUID
export function keySpaceFromEnv(): string;      // readEnv('VERCEL_ENV') ?? 'development'
```

- Keys: `${keySpace}:guesses`, `${keySpace}:decoys`, `${keySpace}:game`.
- Hash values are stored without `id`. `load()` restores `id` from the field name.
- Produces (`_lib/__fixtures__/fakeKv.ts`): `fakeHashKv(): HashKv & { data: Map<string, unknown> }`, an in-memory store with real `hsetnx` semantics (a field that already exists returns `false` and is left unchanged). Task 7 reuses it.

- [ ] **Step 1: Write the failing tests.**

```ts
it('stores a Guess under the key space and the Guesser’s normalised name', async () => {
  const kv = fakeHashKv();
  const store = createGameStore(kv, 'preview');
  expect(await store.addGuess({ guesser: 'Aunt May', first: 'Ava', middle: 'Rose', at: 't' })).toBe(true);
  expect((await store.load()).guesses).toEqual([{ id: 'aunt may', guesser: 'Aunt May', first: 'Ava', middle: 'Rose', at: 't' }]);
  expect([...kv.data.keys()]).toContain('preview:guesses');
});
it('refuses a second Guess under the same name, however it is typed, even at the same moment', async () => {
  const store = createGameStore(fakeHashKv(), 'preview');
  const [a, b] = await Promise.all([
    store.addGuess({ guesser: 'Mom', first: 'Ava', middle: 'Rose', at: 't1' }),
    store.addGuess({ guesser: ' mom ', first: 'Zoe', middle: 'Kate', at: 't2' }),
  ]);
  expect([a, b].sort()).toEqual([false, true]);
  expect((await store.load()).guesses).toHaveLength(1);
});
it('gives each Decoy its own id and removes by id', async () => { /* newId → 'd1','d2'; removeDecoy('d1') leaves only d2; removeGuess likewise */ });
it('saves and loads the game', async () => { /* saveGame(g) then load().game toEqual g */ });
it('starts empty', async () => expect(await createGameStore(fakeHashKv(), 'x').load()).toEqual({ game: null, guesses: [], decoys: [] }));
it('keeps key spaces apart', async () => { /* a Guess in 'preview' is absent from a 'production' store on the same fake */ });
it('reads the key space from VERCEL_ENV', () => {
  vi.stubEnv('VERCEL_ENV', 'production'); expect(keySpaceFromEnv()).toBe('production');
  vi.stubEnv('VERCEL_ENV', '');           expect(keySpaceFromEnv()).toBe('development');
});
```

Add `afterEach(() => vi.unstubAllEnvs())`.

- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/store.test.ts`. Expected: FAIL, the module isn't found.
- [ ] **Step 3: Implement `_lib/store.ts` and `_lib/__fixtures__/fakeKv.ts`** per the Interfaces block.
- [ ] **Step 4: Run the tests to verify they pass.** Same command, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/pages/lab/baby-guess/_lib && git commit -m "feat(baby-guess): Redis game store"`

---

### Task 7: Game actions

**Files:**
- Create: `<proj>/_lib/actions.ts`
- Test: `<proj>/_lib/actions.test.ts`

**Interfaces:**
- Consumes: `GameStore`, `createGameStore` (Task 6); `fakeHashKv` (Task 6 fixture); `phaseOf`, `buildLock`, `boardCandidates`, `eliminatedKeys` (Task 4); `publicState`, `hostState` (Task 5); `reanchor` (Task 3); `centralDay` (Task 3); `cleanName`, `normalize` (Task 2); `HttpError`.
- Produces (`_lib/actions.ts`):

```ts
export interface ActionDeps { store: GameStore; now: () => Date; random?: () => number } // random defaults to crypto.getRandomValues-backed [0,1)
export interface GuessInput { guesser: string; first: string; middle: string }
export interface ConfigInput { lastGuessDay?: Day; dueDate?: Day; hints?: Record<BoardId, string> }
export function submitGuess(deps: ActionDeps, input: GuessInput): Promise<GuessInput>; // stores and returns cleanName'd values, at = now().toISOString()
export function saveConfig(deps: ActionDeps, input: ConfigInput): Promise<Game>;
export function addDecoy(deps: ActionDeps, input: { first: string; middle: string }): Promise<void>;
export function removeEntry(deps: ActionDeps, input: { kind: 'guess' | 'decoy'; id: string }): Promise<void>;
export function lockBoards(deps: ActionDeps, picks: Record<BoardId, string[]>): Promise<void>;
export function revealAnswer(deps: ActionDeps, input: Record<BoardId, string>): Promise<void>; // keys normalised
export function readPublic(deps: ActionDeps): Promise<PublicState>;
export function readHost(deps: ActionDeps): Promise<HostState>;
```

"Today" is always `centralDay(deps.now())`. Errors are `HttpError(status, message)` with this exact copy:

| Condition | Status | Message |
|---|---|---|
| `submitGuess` in `setup` | 409 | `Guessing hasn't opened yet.` |
| `submitGuess` in `boards` or `revealed` | 409 | `Guessing is closed.` |
| Guesser name taken | 409 | `Someone named ${cleanName(guesser)} already guessed. Add your last initial.` |
| any Host write when `revealed` | 409 | `The game is over.` |
| first `saveConfig` missing any field | 400 | `Set the last guessing day, the Due Date and both Hints.` |
| changing `lastGuessDay` or `hints` when phase is `boards` | 409 | `Guessing has closed, so the last guessing day and Hints are fixed.` |
| resulting `dueDate ≤ lastGuessDay` | 400 | `The Due Date must be after the last guessing day.` |
| `addDecoy` / `removeEntry` once locked | 409 | `The Boards are locked.` |
| `lockBoards` when phase isn't `boards` (`setup`/`guessing`) | 409 | `Lock the Boards after guessing closes.` |
| `lockBoards` when already locked | 409 | `The Boards are already locked.` |
| `revealAnswer` in `setup` | 409 | `Set up the game first.` |
| `revealAnswer` with a key that isn't a non-Eliminated Candidate today | 400 | `The Answer's first name must be a Candidate still on the first-name Board.` (and `middle name` / `middle-name`) |

When `saveConfig` changes `dueDate` after the lock, every Board's anchor becomes
`reanchor(order.length, anchor, oldDueDate, today)`.

- [ ] **Step 1: Write the failing tests.**
  - **Setup:** a `deps(at: string)` helper builds `{ store: createGameStore(fakeHashKv(), 'test'), now: () => new Date(clock) }` with a mutable `clock`, and a seeded `random`.
  - **Base game:** `lastGuessDay '2027-01-05'`, `dueDate '2027-01-20'`.

```ts
it('accepts a Guess at 11:59 pm Central on the last guessing day and refuses one at midnight', async () => {
  clock = '2027-01-06T05:59:00Z'; await expect(submitGuess(d, mom)).resolves.toBeTruthy();
  clock = '2027-01-06T06:00:00Z'; await expect(submitGuess(d, dad)).rejects.toMatchObject({ status: 409, message: 'Guessing is closed.' });
});
it('lets only one of two simultaneous same-name Guesses through, with the spec copy', async () => {
  const settled = await Promise.allSettled([submitGuess(d, { ...mom, guesser: 'Mom' }), submitGuess(d, { ...dad, guesser: 'mom ' })]);
  expect(settled.filter((s) => s.status === 'fulfilled')).toHaveLength(1);
  const rejected = settled.find((s) => s.status === 'rejected') as PromiseRejectedResult;
  expect(rejected.reason).toMatchObject({ status: 409 });
  expect(rejected.reason.message).toMatch(/^Someone named (Mom|mom) already guessed\. Add your last initial\.$/);
});
it("refuses Guesses before setup with 409 Guessing hasn't opened yet.", async () => { /* … */ });
describe('saveConfig', () => {
  it('needs every field the first time', async () => { /* 400 copy */ });
  it('allows changes while guessing is open', async () => { /* … */ });
  it('fixes the last guessing day and Hints after the Deadline', async () => { /* 409 copy */ });
  it('requires the Due Date after the last guessing day', async () => { /* 400 copy */ });
  it('re-anchors after the lock when the Due Date moves, keeping today’s Eliminations', async () => {
    // lock on 01-06; on 01-13 move dueDate to 01-16: game.lock.boards.first.anchor equals { day: '2027-01-13', eliminated: <count on 01-13 under the old Due Date> }
  });
});
it('adds and removes Decoys and Guesses until the lock, then refuses with 409 The Boards are locked.', async () => { /* … */ });
describe('lockBoards', () => {
  it('refuses before the Deadline', async () => { /* 409 copy */ });
  it('locks once with picks in display form and any case', async () => { /* picks ['Olivia ', 'AVA', …] succeed; second call → 409 already locked */ });
});
describe('revealAnswer', () => {
  it('accepts the Answer as typed (" Olivia", "ROSE")', async () => { /* readPublic → phase 'revealed', answer { first: 'Olivia', middle: 'Rose' } */ });
  it('refuses an Eliminated Candidate', async () => { /* 400 copy */ });
  it('works before the lock, for an early baby', async () => { /* … */ });
  it('ends the game: Guesses close and Host writes get 409 The game is over.', async () => { /* … */ });
});
```

Write the commented bodies out in full.

- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/actions.test.ts`. Expected: FAIL, the module isn't found.
- [ ] **Step 3: Implement `_lib/actions.ts`** per the Interfaces block and the table.
- [ ] **Step 4: Run the tests to verify they pass.** Same command, then `npm test`. Expected: PASS.
- [ ] **Step 5: Commit.** `git add src/pages/lab/baby-guess/_lib && git commit -m "feat(baby-guess): game actions"`

---

### Task 8: API routes, Host auth, and a reset script

**Files:**
- Create: `<proj>/_lib/auth.ts`, `<proj>/_lib/schemas.ts`, `<proj>/_lib/server.ts`
- Create: `<proj>/api/state.ts`, `<proj>/api/guess.ts`, `<proj>/api/host/{state,config,decoy,remove,lock,reveal}.ts`
- Create: `<proj>/_scripts/reset.mjs`
- Test: `<proj>/_lib/auth.test.ts`, `<proj>/_lib/schemas.test.ts`

**Interfaces:**
- Consumes: all actions (Task 7); `createGameStore`, `keySpaceFromEnv` (Task 6); `isNamePart`, `isGuesserName` (Task 2); `isDay` (Task 3); `handler`, `json`, `readBody`, `readEnv`, `HttpError` (`@lab/api`); `kv` (`@lab/kv`); `rateLimit` (`@lab/rateLimit`).
- Produces:
  - `auth.ts`: `checkHostToken(authorization: string | null, expected: string | undefined): void`
    - `expected` empty → `HttpError(500, 'Host token not configured')`;
    - otherwise `HttpError(401, 'Unauthorized')` unless the header is exactly `Bearer <expected>`;
    - compares the SHA-256 digests of both strings with `timingSafeEqual` (`node:crypto`).
  - `schemas.ts`:
    - `guessSchema`: `{ guesser, first, middle }`;
    - `decoySchema`: `{ first, middle }`;
    - `removeSchema`: `{ kind: z.enum(['guess','decoy']), id: z.string().min(1) }`;
    - `configSchema`: every field optional, hints `{ first, middle }` each `z.string().trim().min(1).max(200)`;
    - `lockSchema`: `{ first, middle }`, each `z.array(z.string()).length(5)`;
    - `revealSchema`: `{ first, middle }`, each `z.string().min(1)`.
    - Name fields use `z.string().refine(isNamePart, 'Use letters, spaces, hyphens or apostrophes (up to 30).')`, the guesser `refine(isGuesserName, 'Enter your name (up to 50 characters).')`, and days `refine(isDay, 'Use YYYY-MM-DD.')`.
  - `server.ts`:
    - `SLUG = 'baby-guess'`;
    - `deps(): ActionDeps`: memoised `createGameStore(kv(SLUG), keySpaceFromEnv())`, with `now: () => new Date()`;
    - `noStore(data: unknown, status = 200): Response`: `json` plus `cache-control: no-store`;
    - `guardHost(request: Request): Promise<void>`: `rateLimit(request, { slug: SLUG, id: 'host', limit: 30, window: '1 m' })`, then `checkHostToken(request.headers.get('authorization'), readEnv('BABY_GUESS_HOST_TOKEN'))`.
  - Routes: each has `export const prerender = false` and a `handler(async ({ request }) => …)`.

    | File | Method | Body | Returns |
    |---|---|---|---|
    | `api/state.ts` | GET | — | `rateLimit` id `'state'` 60/`'1 m'` → `noStore(await readPublic(deps()))` |
    | `api/guess.ts` | POST | `guessSchema` | `rateLimit` id `'guess'` 20/`'10 m'` → `noStore({ guess }, 201)` |
    | `api/host/state.ts` | GET | — | `guardHost` → `noStore(await readHost(deps()))` |
    | `api/host/config.ts` | POST | `configSchema` | `guardHost` → `saveConfig` → `noStore({ ok: true })` |
    | `api/host/decoy.ts` | POST | `decoySchema` | `guardHost` → `addDecoy` → `noStore({ ok: true })` |
    | `api/host/remove.ts` | POST | `removeSchema` | `guardHost` → `removeEntry` → `noStore({ ok: true })` |
    | `api/host/lock.ts` | POST | `lockSchema` | `guardHost` → `lockBoards` → `noStore({ ok: true })` |
    | `api/host/reveal.ts` | POST | `revealSchema` | `guardHost` → `revealAnswer` → `noStore({ ok: true })` |

  - `_scripts/reset.mjs <keySpace>`:
    - exits 1 with `Refusing to reset production.` for `production`, or with a usage line when there's no argument;
    - otherwise deletes `lab:baby-guess:<keySpace>:guesses`, `:decoys` and `:game` through `new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })`, and prints how many keys it removed;
    - run it with `node --env-file=.env src/pages/lab/baby-guess/_scripts/reset.mjs preview`.

- [ ] **Step 1: Write the failing tests.** Use a local `statusOf(fn)` helper that returns the thrown `HttpError`'s `status`.

```ts
describe('checkHostToken', () => {
  it('accepts the exact bearer token', () => expect(() => checkHostToken('Bearer s3cret-token', 's3cret-token')).not.toThrow());
  it.each([[null], ['Bearer wrong'], ['Basic s3cret-token'], ['Bearer s3cret-token2'], ['s3cret-token']])('401s %j', (h) =>
    expect(statusOf(() => checkHostToken(h, 's3cret-token'))).toBe(401));
  it.each([[undefined], ['']])('500s when the token is not configured (%j)', (e) =>
    expect(statusOf(() => checkHostToken('Bearer x', e))).toBe(500));
});
describe('schemas', () => {
  it('accepts a phone-typed Guess', () => expect(guessSchema.parse({ guesser: 'Aunt May', first: 'Zoë', middle: 'O’Brien' })).toBeTruthy());
  it('rejects a bad name part and a blank Guesser', () => {
    expect(guessSchema.safeParse({ guesser: 'A', first: 'R2D2', middle: 'Rose' }).success).toBe(false);
    expect(guessSchema.safeParse({ guesser: '   ', first: 'Ava', middle: 'Rose' }).success).toBe(false);
  });
  it('needs exactly 5 picks per Board', () => expect(lockSchema.safeParse({ first: ['a', 'b', 'c', 'd'], middle: ['a', 'b', 'c', 'd', 'e'] }).success).toBe(false));
  it('takes partial config and real days only', () => {
    expect(configSchema.safeParse({}).success).toBe(true);
    expect(configSchema.safeParse({ dueDate: '2027-01-20' }).success).toBe(true);
    expect(configSchema.safeParse({ dueDate: '2027-02-30' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/auth.test.ts src/pages/lab/baby-guess/_lib/schemas.test.ts`. Expected: FAIL, the modules aren't found.
- [ ] **Step 3: Implement `auth.ts`, `schemas.ts`, `server.ts`, the eight route files and `reset.mjs`** per the Interfaces block.
- [ ] **Step 4: Run the tests to verify they pass.** Run `npm test`. Expected: all PASS, including the isolation check over the new files.
- [ ] **Step 5: Smoke-test locally.**
  - Add `BABY_GUESS_HOST_TOKEN=local-host-token` to `.env`, which is gitignored and already holds `KV_REST_API_*`.
  - Local dev runs in the **`preview`** key space, because the pulled `.env` sets `VERCEL_ENV="preview"`. That's fine: it never touches production.
  - Run `npm run dev`, then use `T=<today>` and `D=<today+7>` (both `YYYY-MM-DD`, Central):

```bash
B=http://localhost:4321/lab/baby-guess/api; H='authorization: Bearer local-host-token'; J='content-type: application/json'
curl -s $B/state                                                              # {"phase":"setup"}
curl -s -X POST $B/host/config -H "$H" -H "$J" -d "{\"lastGuessDay\":\"$T\",\"dueDate\":\"$D\",\"hints\":{\"first\":\"Two syllables\",\"middle\":\"A family name\"}}"   # {"ok":true}
curl -s -X POST $B/guess -H "$J" -d '{"guesser":"Smoke Test","first":"Ava","middle":"Rose"}'   # 201 {"guess":…}
curl -s -X POST $B/guess -H "$J" -d '{"guesser":"smoke test","first":"Zoe","middle":"Kate"}'   # 409 Someone named smoke test already guessed. Add your last initial.
curl -s $B/state                                                              # phase guessing, count 1
curl -s -o /dev/null -w '%{http_code}\n' $B/host/state -H 'authorization: Bearer wrong'        # 401
curl -s -X POST $B/guess -H 'content-type: text/plain' -d 'x' -o /dev/null -w '%{http_code}\n' # 403 or 400, never 201
```

  Then run `node --env-file=.env src/pages/lab/baby-guess/_scripts/reset.mjs preview`. Expected: `Removed 2 keys` (guesses and game), and `curl -s $B/state` returns `{"phase":"setup"}` again.
- [ ] **Step 6: Commit.** `git add src/pages/lab/baby-guess && git commit -m "feat(baby-guess): API routes, Host auth and reset script"`

---

### Task 9: Layout and the Guesser page

**Files:**
- Create: `<proj>/_components/Layout.astro`, `<proj>/_components/baby.css`, `<proj>/_assets/og.png`
- Create: `<proj>/_lib/client.ts`
- Test: `<proj>/_lib/client.test.ts`
- Modify: `<proj>/index.astro` (replace the scaffold)
- Modify: `package.json` / `package-lock.json` (add `@fontsource/nunito`)

**Interfaces:**
- Consumes: `PublicState` and types (Task 5); `GuessInput` (Task 7, type only); `BoardId` (Task 4); `SLUG` is **not** imported into the page (it would pull server code into the page). Use the literal `'baby-guess'` with `labUrl`.
- Produces:
  - `Layout.astro` props: `{ title: string; description: string; path?: string }` (`path` is within the project, default `'/'`). Its `<head>` contains:
    - `<meta name="robots" content="noindex">`;
    - `<title>{title}</title>` (no suffix) and the description;
    - canonical `https://baby-guess.isaacdessert.dev{path}`;
    - `og:title`, `og:description`, `og:url` (the same as canonical), `og:type website`, `og:site_name Baby Guess`;
    - `og:image` = `new URL(ogImage.src, 'https://baby-guess.isaacdessert.dev').href`, where `ogImage` is imported from `../_assets/og.png`;
    - `twitter:card summary_large_image`, plus `twitter:title`, `twitter:description` and `twitter:image`;
    - favicon `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🍼</text></svg>">`.
    - It imports `@fontsource/nunito/400.css`, `@fontsource/nunito/700.css` and `./baby.css`.
  - `baby.css`: the `@tailwind base; @tailwind components; @tailwind utilities;` directives, then `:root` variables:
    - `--cream: #fff8f0`, `--card: #ffffff`, `--ink: #3b2f2f`, `--muted: #8a7a70`, `--accent: #e07a5f`, `--sage: #81b29a`, `--gone: #c9bfb7`;
    - `body { background: var(--cream); color: var(--ink); font-family: 'Nunito', system-ui, sans-serif; }`.
  - `client.ts`:
    - `GUESS_KEY = 'baby-guess:guess'`;
    - `rememberGuess(storage: Storage | undefined, guess: GuessInput): void`;
    - `recallGuess(storage: Storage | undefined): GuessInput | null`. Every storage access sits in try/catch, and malformed or missing data gives `null`;
    - `boardFromHash(hash: string): BoardId`: `'#middle'` → `'middle'`, anything else → `'first'`.
  - `index.astro` copy and structure:
    - `<Layout title="Baby Guess" description="Guess the baby’s first and middle name before guessing closes.">`;
    - one column `max-w-md mx-auto px-4`;
    - `#app` with `data-state={labUrl('baby-guess', 'api/state')}` and `data-guess={labUrl('baby-guess', 'api/guess')}`.
    - Each section starts `hidden`:

    | Section | Shows |
    |---|---|
    | `#loading` | "Loading…" |
    | `#error` | "Something went wrong. Try reloading." |
    | `#setup` | "Guessing opens soon." |
    | `#guessing` | h1 "Guess the baby’s name"; both Hints; "N guessed so far"; inputs "Your name", "First name", "Middle name"; button "Send my guess"; an inline error line showing the response's `issues[0].message` or `error`. Once a Guess is recalled or just sent, the form is replaced by "Your guess: {first} {middle}". |
    | `#boards` | both Hints; a `role="tablist"` with tabs "First name" / "Middle name" (`aria-selected`, `aria-controls`, Left/Right arrows move between tabs, a click sets `location.hash` to `#first`/`#middle`, `hashchange` re-selects); one `role="tabpanel"` list per Board. An Eliminated Candidate gets `line-through`, `color: var(--gone)`, and a visually hidden " (ruled out)". |
    | `#revealed` | h1 "It’s {first} {middle}!"; "Winners" list, or "Nobody got both names."; "Partial winners" with "(first name)" / "(middle name)"; the same Board tabs with the Answer ringed in `var(--accent)` and labelled "the Answer"; an "Everyone’s guesses" table (Guesser, First, Middle). |

- [ ] **Step 1: Write the failing tests** in `client.test.ts`.

```ts
const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } } as unknown as Storage;
it('round-trips a Guess', () => { /* memory Storage: rememberGuess then recallGuess toEqual the guess */ });
it('returns null with no storage, blocked storage or junk', () => {
  expect(recallGuess(undefined)).toBeNull();
  expect(recallGuess(throwing)).toBeNull();
  // memory storage with GUESS_KEY = '{nope' → null
});
it('never throws when storage is blocked', () => expect(() => rememberGuess(throwing, { guesser: 'A', first: 'Ava', middle: 'Rose' })).not.toThrow());
it.each([['#middle', 'middle'], ['', 'first'], ['#nope', 'first']])('boardFromHash(%j) is %s', (h, b) => expect(boardFromHash(h)).toBe(b));
```

- [ ] **Step 2: Run them to verify they fail.** Run `npx vitest run src/pages/lab/baby-guess/_lib/client.test.ts`. Expected: FAIL, the module isn't found.
- [ ] **Step 3: Implement `client.ts`.** Then run the same command. Expected: PASS.
- [ ] **Step 4: Make the link-preview image.** Run `npm install @fontsource/nunito`. Then generate the 1200×630 PNG (cream background, terracotta heading, no emoji, since librsvg may not render it):

```bash
node -e "require('sharp')(Buffer.from(process.argv[1])).png().toFile('src/pages/lab/baby-guess/_assets/og.png').then(i=>console.log(i.width,i.height))" \
'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#fff8f0"/><circle cx="1050" cy="120" r="180" fill="#81b29a" opacity=".35"/><circle cx="140" cy="560" r="220" fill="#e07a5f" opacity=".25"/><text x="100" y="300" font-family="Nunito, Helvetica, Arial, sans-serif" font-size="96" font-weight="700" fill="#e07a5f">Guess the baby’s name</text><text x="100" y="390" font-family="Nunito, Helvetica, Arial, sans-serif" font-size="44" fill="#3b2f2f">First and middle. Then watch the Boards.</text></svg>'
```

  Expected output: `1200 630`.
- [ ] **Step 5: Write `Layout.astro`, `baby.css` and the new `index.astro`** per the Interfaces block. The client `<script>` imports only from `../_lib/client` and types from `../_lib/project`. It fetches state once on load, shows the matching section, and renders names with `textContent`.
- [ ] **Step 6: Check it in the browser.**
  - Run `npm run dev` and use the smoke-test `curl`s from Task 8 to set up each phase:
    - `setup`;
    - `guessing`;
    - `boards`: set `lastGuessDay` to yesterday while still guessing;
    - locked, then revealed, via `/host/lock` and `/host/reveal`.
  - Open `http://localhost:4321/lab/baby-guess/` at a 375 px viewport for each phase and confirm the sections and copy above.
  - Confirm Eliminated names are struck through, `#middle` opens the middle-name tab, and a blocked-storage window can still send a Guess.
  - Finish with `reset.mjs preview`.
- [ ] **Step 7: Build.** Run `npm run build`. Expected: the build passes, and `check-og` reports that all `og:image` references resolve. `grep -c noindex .vercel/output/static/lab/baby-guess/index.html` prints `1`.
- [ ] **Step 8: Commit.** `git add package.json package-lock.json src/pages/lab/baby-guess && git commit -m "feat(baby-guess): layout and Guesser page"`

---

### Task 10: Host page

**Files:**
- Create: `<proj>/host/index.astro`

**Interfaces:**
- Consumes: `Layout.astro` (Task 9, `path="/host/"`, title `Baby Guess · Host`, the same description); `HostState` types (Task 5); the Host routes (Task 8); `labUrl('baby-guess', 'api/host/…')`.
- Produces: the page. Its `<script>` keeps the token in `localStorage` key `baby-guess:host-token` (try/catch), sends `Authorization: Bearer <token>` on every call, re-fetches `api/host/state` after every write, and shows a failed write's `error` message inline. A 401 clears the token and shows the gate with "Wrong token."

**Sections, top to bottom:**

| Section | Content and rules |
|---|---|
| **Gate** | password input + "Open" |
| **Status line** | `Key space: {keySpace} · Today: {today} · Phase: {phase}` |
| **Settings** | date inputs "Last guessing day" and "Due Date"; text inputs "First-name Hint" and "Middle-name Hint"; "Save". The day and Hints are disabled once the phase is `boards` or `revealed`. |
| **Guesses** | table: Guesser, First, Middle, time (local), Delete (`confirm`). Delete is hidden after the lock. |
| **Decoys** | first + middle inputs, "Add Decoy", a list with Delete. Hidden after the lock. Guidance text: "Add Decoys before guessing closes so the count stays believable." and "Put at least one Decoy besides the Answer in each Final Five." |
| **Board (×2)** | headings "First-name Board" / "Middle-name Board". Before the lock: a table of Candidate, Guesses, Decoys and a Final Five checkbox pre-checked from `defaultFinalFive`, with "{n} of 5 picked". After the lock: Eliminated names struck through, Final Five marked ★, and `upcoming` as "Jan 19 · 1, Jan 20 · 2" |
| **Lock** | "Lock both Final Fives" is enabled only in phase `boards`, unlocked, with exactly 5 picked on each Board. It asks `confirm('Lock both Final Fives? This can’t be undone.')` and posts Candidate keys. |
| **Reveal** | available in `guessing`/`boards`. Two `<select>`s of non-Eliminated Candidates and "Reveal", which asks `confirm('Reveal {first} {middle}? This ends the game.')`. |

All rendering goes through `textContent` and DOM APIs.

- [ ] **Step 1: Write `host/index.astro`** per the Interfaces block and the section table.
- [ ] **Step 2: Walk the whole game locally.**
  - With `npm run dev` and `BABY_GUESS_HOST_TOKEN=local-host-token`, open `/lab/baby-guess/host/`:
    1. a wrong token shows the gate again;
    2. save the settings;
    3. send 7 Guesses from the Guesser page in another window;
    4. add 2 Decoys and delete one Guess;
    5. set the last guessing day to yesterday;
    6. confirm the Board tables and default picks, then lock;
    7. confirm the schedule and that Delete and Add are hidden;
    8. Reveal.
  - On the Guesser page, confirm the revealed view lists the Winners and Partial Winners and leaves the Decoys out of "Everyone's guesses".
  - Finish with `reset.mjs preview`.
- [ ] **Step 3: Build.** Run `npm run build`. Expected: PASS, with `.vercel/output/static/lab/baby-guess/host/index.html` containing `noindex`.
- [ ] **Step 4: Commit.** `git add src/pages/lab/baby-guess/host && git commit -m "feat(baby-guess): Host page"`

---

### Task 11: Project docs and final verification

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`.**
  - **Structure tree:** `lab/ (index + injuries/, atlas/)` → `lab/ (index + injuries/, atlas/, baby-guess/)`.
  - **Lab platform → Projects:** append `; baby-guess (unlisted: family baby-name guessing game — two Boards, Host page at /lab/baby-guess/host/; spec docs/superpowers/specs/2026-11-18-baby-guess-design.md; terms in GLOSSARY.md)`.
  - **Deployment → env vars:** append `` `BABY_GUESS_HOST_TOKEN` (different values in Production and Preview)``.
  - **Gotchas:** add a bullet: `**Preview, local dev and production share one Upstash DB.** baby-guess keys carry the environment (lab:baby-guess:<VERCEL_ENV>:…); local dev reads VERCEL_ENV="preview" from the pulled .env, so it shares the preview key space. Reset a non-production key space with node --env-file=.env src/pages/lab/baby-guess/_scripts/reset.mjs preview.`
- [ ] **Step 2: Run everything.** Run `npm test && npm run build`. Expected: all tests PASS, the build passes, and `check-og` is OK.
- [ ] **Step 3: Check the build output.**
  - `grep -L noindex .vercel/output/static/lab/baby-guess/index.html .vercel/output/static/lab/baby-guess/host/index.html` prints nothing.
  - `grep -c baby-guess .vercel/output/static/sitemap-0.xml` prints `0` (unlisted).
  - `grep -o 'lab/baby-guess/api/[a-z/]*' .vercel/output/config.json | sort -u` lists the 8 routes.
- [ ] **Step 4: Commit.** `git add CLAUDE.md && git commit -m "docs: baby-guess in CLAUDE.md"`
- [ ] **Step 5: Hand off the launch checklist** (spec §8). These steps are the Host's own:
  1. Set `BABY_GUESS_HOST_TOKEN` in Vercel Production and Preview.
  2. `git push -u origin lab/baby-guess`, then rehearse at `<preview-url>/lab/baby-guess/` and `/host/`. The Host view must show `Key space: preview`, which confirms that `VERCEL_ENV` reaches functions.
  3. Reset the preview key space.
  4. Merge to `main`, then confirm `Key space: production` at `baby-guess.isaacdessert.dev/host/`.
  5. Set the dates and Hints, check the link preview in a chat app, and share the link.
