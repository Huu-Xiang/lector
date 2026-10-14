import { describe, expect, test } from 'bun:test';
import { validateSettingWrite } from './settings-keys';

describe('nativeLanguage setting', () => {
  test('accepts a listed language and rejects anything else', () => {
    expect(validateSettingWrite('nativeLanguage', 'zh-CN')).toBeNull();
    expect(validateSettingWrite('nativeLanguage', 'xx')).not.toBeNull();
    expect(validateSettingWrite('nativeLanguage', 5)).not.toBeNull();
  });
});
