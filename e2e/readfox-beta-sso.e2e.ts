import { createHmac } from 'node:crypto';
import { test, expect } from '@playwright/test';

const primary = 'http://localhost:3480';
const beta = 'http://127.0.0.1:3481';

function currentTotp(uri: string): string {
  const secret = new URL(uri).searchParams.get('secret')!;
  const bits = [...secret]
    .map((char) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

for (const twoFactor of [false, true]) {
  test(`a primary account ${twoFactor ? 'with two-factor authentication' : 'with a password'} returns to beta report history`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const email = `existing-reader-${Number(twoFactor)}@example.com`;
    const password = 'readfox-e2e-9876';
    const registration = await page.request.post(primary + '/api/auth/sign-up/email', {
      data: { name: 'Existing Reader', email, password },
      headers: { Origin: primary },
    });
    expect(registration.ok()).toBe(true);
    const mail = await page.request.get(primary + '/__sso_e2e_mail');
    const messages = (await mail.json()) as { to: string; text: string }[];
    const verification = messages
      .find((message) => message.to === email)
      ?.text.match(/https?:\/\/\S+/)?.[0];
    expect(verification).toBeTruthy();
    const verified = await page.request.get(verification!, { maxRedirects: 0 });
    expect(verified.status()).toBe(302);
    let backupCode: string | undefined;
    if (twoFactor) {
      const post = (path: string, data: object) =>
        page.request.post(primary + '/api/auth/' + path, {
          headers: { Origin: primary },
          data,
        });
      expect((await post('sign-in/email', { email, password })).ok()).toBe(true);
      const enabled = await post('two-factor/enable', { password });
      expect(enabled.ok()).toBe(true);
      const { totpURI, backupCodes } = (await enabled.json()) as {
        totpURI: string;
        backupCodes: string[];
      };
      expect((await post('two-factor/verify-totp', { code: currentTotp(totpURI) })).ok()).toBe(
        true,
      );
      backupCode = backupCodes[0];
      expect(backupCode).toBeTruthy();
    }
    await page.request.post(primary + '/api/auth/sign-out', {
      headers: { Origin: primary },
      data: {},
    });
    await page.goto(beta + '/login?next=%2Fvocab-test%2Fhistory', {
      waitUntil: 'domcontentloaded',
    });
    await page.getByTestId('login-oidc').click();
    await expect(page).toHaveURL(new RegExp('^http://localhost:3480/login'));
    await page.getByTestId('login-email').fill(email);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();
    if (backupCode) {
      await expect(page).toHaveURL(new RegExp('^http://localhost:3480/two-factor'));
      const guest = await page.request.get(beta + '/api/auth/get-session');
      expect(await guest.json()).toBeNull();
      await page.getByTestId('twofactor-toggle-backup').click();
      await page.getByTestId('twofactor-code').fill(backupCode);
      await page.getByTestId('twofactor-submit').click();
    }
    await expect(page).toHaveURL(beta + '/vocab-test/history');
    const session = await page.request.get(beta + '/api/auth/get-session');
    expect((await session.json()).user.email).toBe(email);
    const primarySession = await page.request.get(primary + '/api/auth/get-session');
    expect((await primarySession.json()).user.id).not.toBe((await session.json()).user.id);
  });
}
