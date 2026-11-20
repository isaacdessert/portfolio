// Request body schemas for the API routes — the guard in front of actions that trust their input
// shapes. See docs/superpowers/specs/2026-11-18-baby-guess-design.md §4.

import { z } from 'astro/zod';
import { isDay } from './days';
import { isGuesserName, isNamePart } from './names';

const namePart = z.string().refine(isNamePart, 'Use letters, spaces, hyphens or apostrophes (up to 30).');
const guesserName = z.string().refine(isGuesserName, 'Enter your name (up to 50 characters).');
const day = z.string().refine(isDay, 'Use YYYY-MM-DD.');

export const guessSchema = z.object({
  guesser: guesserName,
  first: namePart,
  middle: namePart,
});

export const decoySchema = z.object({
  first: namePart,
  middle: namePart,
});

export const removeSchema = z.object({
  kind: z.enum(['guess', 'decoy']),
  id: z.string().min(1),
});

const hint = z.string().trim().min(1).max(200);

export const configSchema = z.object({
  lastGuessDay: day.optional(),
  dueDate: day.optional(),
  hints: z.object({ first: hint, middle: hint }).optional(),
});

export const lockSchema = z.object({
  first: z.array(z.string()).length(5),
  middle: z.array(z.string()).length(5),
});

export const revealSchema = z.object({
  first: z.string().min(1),
  middle: z.string().min(1),
});
