import { describe, expect, it } from 'vitest';
import { annualSavingPercent, monthlyEquivalent } from './plan-prices';

const usd = (amount: string) => ({ amount, currencyCode: 'USD' });

describe('annualSavingPercent', () => {
  it('rounds the saving down to a whole percent', () => {
    expect(annualSavingPercent(usd('399'), usd('3900'))).toBe(18);
    expect(annualSavingPercent(usd('599'), usd('5900'))).toBe(17);
    expect(annualSavingPercent(usd('1299'), usd('12900'))).toBe(17);
  });

  it('gives null when the year saves nothing or a price is missing', () => {
    expect(annualSavingPercent(usd('399'), usd('4788'))).toBeNull();
    expect(annualSavingPercent(usd('399'), undefined)).toBeNull();
    expect(annualSavingPercent(null, usd('3900'))).toBeNull();
  });

  it('does not compare different currencies', () => {
    expect(annualSavingPercent(usd('399'), { amount: '2800', currencyCode: 'CNY' })).toBeNull();
  });
});

describe('monthlyEquivalent', () => {
  it('spreads a year over twelve months, rounded down', () => {
    expect(monthlyEquivalent(usd('3900'))).toEqual(usd('325'));
    expect(monthlyEquivalent(usd('12900'))).toEqual(usd('1075'));
  });
});
