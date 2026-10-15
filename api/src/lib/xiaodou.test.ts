import '../test-guard';
import { describe, expect, test } from 'bun:test';
import { createSign, generateKeyPairSync } from 'crypto';
import { requestSigningString, verifyXiaodouWebhook, webhookSigningString } from './xiaodou';

describe('XD-Signature-v1', () => {
  test('matches the golden vector in the platform docs', () => {
    expect(
      requestSigningString({
        method: 'post',
        path: '/api/open/v1/payments',
        query: 'a=1&b=2',
        timestamp: 1758888888,
        nonce: '6f1c2f7a9d0b4e51',
        appId: 'xdop_example000000000',
        keyId: 'kid_example',
        requestId: '018f2c1e-8b21-7c3a-9f10-2b7c9a1d4e55',
        contentType: 'application/json; charset=utf-8',
        body: '{"outTradeNo":"SHOP20260926A0001"}',
      }),
    ).toBe(
      [
        'XD-Signature-v1',
        'POST',
        '/api/open/v1/payments',
        'a=1&b=2',
        '1758888888',
        '6f1c2f7a9d0b4e51',
        'xdop_example000000000',
        'kid_example',
        '018f2c1e-8b21-7c3a-9f10-2b7c9a1d4e55',
        'application/json',
        '954802c8e1bc119a1927d07af5c27d7c29c6d9467d8e93ccf83ebca8ef0252c7',
      ].join('\n'),
    );
  });
});

describe('verifyXiaodouWebhook', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const body = new TextEncoder().encode('{"eventId":"evt_1","outTradeNo":"rf1"}');
  const headers: Record<string, string> = {
    'x-xd-webhook-key-id': 'kid_test',
    'x-xd-webhook-event-id': 'evt_1',
    'x-xd-webhook-event-type': 'PAYMENT_SUCCEEDED',
    'x-xd-webhook-timestamp': '1792000000',
    'x-xd-webhook-nonce': 'nonce-123456789012',
  };
  headers['x-xd-webhook-signature'] = createSign('RSA-SHA256')
    .update(
      webhookSigningString({
        eventId: 'evt_1',
        eventType: 'PAYMENT_SUCCEEDED',
        timestamp: '1792000000',
        nonce: 'nonce-123456789012',
        keyId: 'kid_test',
        rawBody: body,
      }),
    )
    .sign(privateKey, 'base64');
  const keys = { kid_test: pem };

  test('accepts the platform signature over the raw bytes', () => {
    expect(verifyXiaodouWebhook((n) => headers[n], body, keys)).toBe(true);
  });

  test('rejects a changed body, an unknown key, or a missing header', () => {
    const changed = new TextEncoder().encode('{"eventId":"evt_1","outTradeNo":"rf2"}');
    expect(verifyXiaodouWebhook((n) => headers[n], changed, keys)).toBe(false);
    expect(verifyXiaodouWebhook((n) => headers[n], body, {})).toBe(false);
    expect(
      verifyXiaodouWebhook(
        (n) => (n === 'x-xd-webhook-nonce' ? undefined : headers[n]),
        body,
        keys,
      ),
    ).toBe(false);
  });
});
