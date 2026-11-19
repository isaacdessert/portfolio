# Portfolio

Isaac Dessert's personal site, isaacdessert.dev, and the lab of small projects it hosts.

## Language

### Baby name game

A lab project where friends and family guess the baby's name before it is announced.

**Host**:
The person running the game, who chooses the Final Five and triggers the Reveal.
_Avoid_: admin, owner

**Guesser**:
A friend or family member taking part in the game.
_Avoid_: user, player, participant

**Guess**:
One first and middle name submitted by a Guesser. Each Guesser makes exactly one.
_Avoid_: entry, submission, vote

**Decoy**:
A made-up first and middle name the Host adds, counted and shown like a Guess but belonging to no Guesser, so that a name nobody guessed, such as the Answer, can't be singled out. A Decoy never wins.
_Avoid_: fake, seed, dummy

**Hint**:
A clue the Host writes about the Answer's first name or its middle name; there is one of each.
_Avoid_: clue, tip

**Deadline**:
The moment guessing closes and the Boards open.
_Avoid_: set date, cutoff, close date

**Due Date**:
The baby's due date, by which each Board is down to its Final Five.

**Board**:
One of two displays, the first-name Board and the middle-name Board, each showing its Candidates from the Deadline on.
_Avoid_: leaderboard, list

**Candidate**:
A distinct name on one Board, grouping every Guess and Decoy that has it in that position.
_Avoid_: name, tile, option

**Eliminated**:
Said of a Candidate that has been ruled out as the Answer.
_Avoid_: greyed out, removed, struck

**Final Five**:
The five Candidates on a Board that the Host keeps from being Eliminated; one of them is the Answer's name for that Board.
_Avoid_: finalists, shortlist

**Answer**:
The baby's actual first and middle name.
_Avoid_: selected name, real name, winning name

**Reveal**:
The moment the Host shows the Answer to Guessers, ending the game.
_Avoid_: announcement

**Winner**:
A Guesser whose Guess matches the Answer's first and middle name.

**Partial Winner**:
A Guesser whose Guess matches the Answer's first name or its middle name, but not both.
_Avoid_: runner-up
