import { describe, expect, test } from 'bun:test';
import { validateSettingWrite } from './settings-keys';

describe('nativeLanguage setting', () => {
  test('accepts a listed language and rejects anything else', () => {
    expect(validateSettingWrite('nativeLanguage', 'zh-CN')).toBeNull();
    expect(validateSettingWrite('nativeLanguage', 'xx')).not.toBeNull();
    expect(validateSettingWrite('nativeLanguage', 5)).not.toBeNull();
  });
});

describe('readingLevels setting', () => {
  test('maps language codes to CEFR levels', () => {
    expect(validateSettingWrite('readingLevels', { en: 'B1', fr: 'A2' })).toBeNull();
    expect(validateSettingWrite('readingLevels', {})).toBeNull();
    expect(validateSettingWrite('readingLevels', { en: 'B3' })).not.toBeNull();
    expect(validateSettingWrite('readingLevels', { xx: 'B1' })).not.toBeNull();
    expect(validateSettingWrite('readingLevels', ['B1'])).not.toBeNull();
    expect(validateSettingWrite('readingLevels', 'B1')).not.toBeNull();
  });
});

describe('readingInterests setting', () => {
  test('accepts a list of known interest ids, with no repeats', () => {
    expect(validateSettingWrite('readingInterests', [])).toBeNull();
    expect(validateSettingWrite('readingInterests', ['news', 'travel'])).toBeNull();
    expect(validateSettingWrite('readingInterests', ['news', 'travel', 'science', 'literature'])).toBeNull();
    expect(validateSettingWrite('readingInterests', ['news', 'news'])).not.toBeNull();
    expect(validateSettingWrite('readingInterests', ['sports'])).not.toBeNull();
    expect(validateSettingWrite('readingInterests', 'news')).not.toBeNull();
    expect(validateSettingWrite('readingInterests', [1])).not.toBeNull();
  });
});
