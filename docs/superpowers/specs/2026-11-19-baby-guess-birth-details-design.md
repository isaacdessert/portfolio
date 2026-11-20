# Baby Guess: Birth Details — Design

**Date:** 2026-11-19
**Status:** Agreed in brainstorming; builder-checked; awaiting the Host's read-through
**Builds on:** `docs/superpowers/specs/2026-11-18-baby-guess-design.md` (the name game, shipped on
branch `lab/baby-guess`). Terms are in `GLOSSARY.md`; this adds **Birth Details**.

## Intent

Alongside the baby's first and middle name, every Guesser also guesses the classic "baby pool"
numbers: **birth date, time of birth, weight and length**. Everyone already knows it's a boy, so
there is no sex guess. Nobody, including the parents, knows these answers until the baby
arrives, so they work differently from the name. There is nothing to keep secret and nothing to
rule out day by day. The Host enters the real values at the Reveal, and whoever was closest in
each category wins it.

**Success:** one visit to the form covers everything. Reveal day gets a second round of fun ("who
nailed the weight?"), and the results show at a glance how close everyone was.

## Decided with the Host

- **The four Birth Details:** birth date, time of birth, weight, length.
- **Same Guess form:** they are part of the one Guess, under the two name fields. **All four are
  required**, and like the name they can't be changed once sent.
- **Birth date:** chosen within about a month either side of the Due Date. The real Due Date is
  **April 3 (2027)**; it is the existing Host setting, entered in the Host view.
- **Time of birth:** hour and minute, shown with AM/PM.
- **Weight:** pounds and ounces (e.g. 7 lb 8 oz).
- **Length:** inches in half-inch steps (e.g. 20½ in).
- **At the Reveal**, the Host enters the real date, time, weight and length together with picking
  the Answer. Everything comes out at once.
- **Winners per category:** whoever is closest wins that category. **Ties share** the win. There
  is **no "closest without going over"** rule.
- **Time is time of day only:** it wraps around midnight, so for an 11:58 pm birth, an 11:50 pm
  guess beats a 2:00 am one.
- **The name keeps its Winners and Partial Winners** exactly as now.
- **Results page:** a small chart per category shows where everyone's guesses landed, with a
  marker for the real value. The "Everyone's guesses" table gains the four columns.
- **Before the Reveal**, Birth Details stay hidden from the public, like who guessed what. The
  Boards stay names-only.
- **No corrections after the Reveal.** The Reveal stays final, Birth Details included. The guard
  is the confirmation step, which repeats every value before it goes out.

## Goals, non-goals, anti-goals

- **Goals:** the four guesses on the form, the Host entering real values at the Reveal, a
  closest-wins result per category, and charts plus table columns on the results page.
- **Non-goals:** an overall points leaderboard; extra categories (hair, looks-like, early/late);
  editing a Guess; correcting the real values after the Reveal; partial credit for the Birth
  Details; showing guesses before the Reveal.
- **Anti-goals:**
  - The name game's secrecy must not weaken. No new field may let anyone infer the Final Five
    or who guessed which name before the Reveal (spec §2 still holds).
  - The form must not become a chore for a grandparent on a phone. Each Birth Detail is one
    simple control with a sensible default, not free-text number typing.

## Builder's calls (made here so planning doesn't have to guess)

These are the designer's calls, not the Host's; change them if a better option shows up.

- **Date window:** the date must fall within **Due Date − 30 days … Due Date + 30 days**, using
  the Due Date stored at the moment the Guess is sent. If the Host later moves the Due Date,
  earlier Guesses stay as they are. The form's date picker gets `min`/`max` from it.
- **The Due Date becomes public in the `guessing` phase**, so the form can set its date range,
  and the form says "Due April 3". It was never secret. No other phase gains it.
- **Stored units:**
  - date: a `Day`;
  - time: `"HH:MM"`, 24-hour;
  - weight: whole **ounces** (`lb × 16 + oz`);
  - length: **inches as a multiple of 0.5**.
- **Allowed ranges** (refused with a clear 400 message otherwise):
  - weight 2 lb 0 oz – 14 lb 15 oz (32–239 oz);
  - length 12–26 in, in half-inch steps;
  - time 00:00–23:59.
- **Form controls:**
  - birth date: a native date input, defaulting to the Due Date;
  - time: a native time input, defaulting to 12:00 pm;
  - weight: two dropdowns, lb (2–14, default 7) and oz (0–15, default 8);
  - length: one dropdown, 12–26 in by halves (default 20).

  Defaults avoid blank required fields. The confirmation line after sending echoes everything:
  "Your guess: Olivia Rose · Apr 5 at 3:20 pm · 7 lb 8 oz · 20½ in".
- **Distances:**
  - date: absolute days;
  - time: minutes on a 24-hour circle, `min(d, 1440 − d)`;
  - weight: absolute ounces;
  - length: absolute inches.
- **Winner order:** ties are listed alphabetically by Guesser.
- **Decoys have no Birth Details.** They stay first + middle only, never appear in the Birth
  Details results, charts or counts, and the Host's Decoy form is unchanged.
- **Guesses without Birth Details:** Guesses stored before this ships, such as local test data,
  are tolerated. They load fine and are skipped in the Birth Details results and charts. Their
  table cells show "—". New Guesses always have them.
- **Reveal needs all four real values.** The Host's Reveal form gets date, time, weight (lb/oz)
  and length controls, using the same kinds of control as the Guess form. **The real values get
  wider limits than guesses**, so a real birth outside the guessing ranges can never block the
  Reveal: any date, weight 0 lb 8 oz – 20 lb 0 oz (8–320 oz), and length 8–32 in by halves. That
  means `_lib/birth.ts` has two validators, one for a Guess and one for the real values. The Reveal confirmation names them: "Reveal Olivia Rose, born Apr 4 at 3:12 am, 7 lb 9 oz,
  20½ in? This ends the game."
- **The Host view** shows each Guess's Birth Details in its Guesses table, since the Host sees
  everything already. They are not secret from the Host.
- **Public state after the Reveal** adds the real values and, per category, the winners (with
  their guess) plus every Guesser's value for the charts. The `guesses` list gains each Guess's
  Birth Details. Before the Reveal, public state carries no Birth Details at all, which is
  added to the secrecy tests.
- **Charts:**
  - one compact strip (dot) chart per category: dots for guesses, stacked when equal, and a
    labelled marker for the real value;
  - built with plain SVG/DOM, with no chart library and no `innerHTML`, so names stay
    XSS-safe;
  - the time chart runs 12 am → 12 am on a straight axis, even though scoring wraps;
  - the charts are decoration; the winner lines and the table carry the same information as
    text for screen readers.

## What's left to the builder

- Exact module boundaries. A pure, tested `_lib/birth.ts` for validation, distances and winners
  seems right, alongside `game.ts`.
- Chart styling within the page's existing palette and fonts.
- Copy for the results section beyond the lines quoted above.
- Test layout, following the existing `_lib/*.test.ts` patterns (secrecy, timeline, actions).

## Touch points (for orientation)

- **`_lib`:** `game.ts` (types), `schemas.ts` (guess + reveal input), `actions.ts` (submit:
  date window; reveal: real values), `project.ts` (public and Host projections plus secrecy),
  `store.ts` (stored Guess shape), and a new `birth.ts`.
- **Pages:** `index.astro` (form, confirmation, results section, charts, table columns) and
  `host/index.astro` (Guesses table columns, Reveal form).
- **Docs:** `GLOSSARY.md` (Birth Details), and the original spec's §1/§2 references where they
  change.
