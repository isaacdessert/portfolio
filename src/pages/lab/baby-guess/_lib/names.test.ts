import { describe, expect, it } from 'vitest';
import { displaySpelling, isGuesserName, isNamePart, normalize } from './names';

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
