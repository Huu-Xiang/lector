import { describe, expect, it } from 'vitest';
import { lessonHeading, repeatsBookTitle } from './lesson-heading';

describe('repeatsBookTitle', () => {
  it('is true for a number and the book title', () => {
    expect(repeatsBookTitle("3. Gulliver's Travels", ["Gulliver's Travels"])).toBe(true);
    expect(repeatsBookTitle('12 Candide, ou l’optimisme', ["Candide, ou l'optimisme"])).toBe(true);
    expect(repeatsBookTitle('2、格列佛游记', ['Gulliver’s Travels', '格列佛游记'])).toBe(true);
  });

  it('is false for a real chapter title', () => {
    expect(repeatsBookTitle('1. Part I. A Voyage to Lilliput.', ["Gulliver's Travels"])).toBe(
      false,
    );
    expect(repeatsBookTitle('4.', ["Gulliver's Travels"])).toBe(false);
  });
});

describe('lessonHeading', () => {
  const titles = ["Gulliver's Travels"];

  it('shows the excerpt in place of a title that repeats the book', () => {
    expect(
      lessonHeading(
        { title: "2. Gulliver's Travels", excerpt: 'It seems, that upon…' },
        titles,
        67,
      ),
    ).toBe('It seems, that upon…');
  });

  it('keeps a real chapter title', () => {
    expect(
      lessonHeading(
        { title: '1. Part I. A Voyage to Lilliput.', excerpt: 'My father…' },
        titles,
        67,
      ),
    ).toBe('1. Part I. A Voyage to Lilliput.');
  });

  it('keeps the title of the one lesson of an article, and of a lesson with no text', () => {
    expect(lessonHeading({ title: "Gulliver's Travels", excerpt: 'It seems…' }, titles, 1)).toBe(
      "Gulliver's Travels",
    );
    expect(lessonHeading({ title: "2. Gulliver's Travels", excerpt: '' }, titles, 67)).toBe(
      "2. Gulliver's Travels",
    );
  });
});
