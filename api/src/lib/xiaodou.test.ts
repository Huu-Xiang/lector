import '../test-guard';
import { describe, expect, test } from 'bun:test';
import { createHash } from 'crypto';
import {
  DEFAULT_CN_PRICES,
  epaySign,
  fenToYuan,
  verifyEpayNotice,
  xiaodouConfigFromEnv,
  yuanToFen,
  type XiaodouConfig,
} from './xiaodou';

const CFG: XiaodouConfig = {
  gateway: 'https://pay.example',
  pid: '1001',
  key: 'secretkey',
  publicOrigin: 'https://readfox.test',
  prices: DEFAULT_CN_PRICES,
};

describe('易支付 signature', () => {
  test('signs sorted, non-empty params without sign fields, then appends the key', () => {
    const params = {
      pid: '1001',
      money: '15.00',
      out_trade_no: 'rf1',
      name: 'Plus',
      param: '',
      sign_type: 'MD5',
    };
    const expected = createHash('md5')
      .update('money=15.00&name=Plus&out_trade_no=rf1&pid=1001secretkey')
      .digest('hex');
    expect(epaySign(params, 'secretkey')).toBe(expected);
  });

  test('verifies a notice from the right merchant only', () => {
    const notice: Record<string, string> = {
      pid: '1001',
      trade_no: 'T1',
      out_trade_no: 'rf1',
      type: 'alipay',
      name: 'Plus',
      money: '15.00',
      trade_status: 'TRADE_SUCCESS',
      sign_type: 'MD5',
    };
    notice.sign = epaySign(notice, 'secretkey');
    expect(verifyEpayNotice(notice, CFG)).toBe(true);
    expect(verifyEpayNotice({ ...notice, money: '0.01' }, CFG)).toBe(false);
    expect(verifyEpayNotice({ ...notice, pid: '9999' }, CFG)).toBe(false);
    expect(verifyEpayNotice({ ...notice, sign: notice.sign.toUpperCase() }, CFG)).toBe(true);
  });
});

describe('money and config', () => {
  test('converts between fen and yuan', () => {
    expect(fenToYuan(1500)).toBe('15.00');
    expect(fenToYuan(14400)).toBe('144.00');
    expect(yuanToFen('15.00')).toBe(1500);
    expect(yuanToFen('1.1')).toBe(110);
  });

  test('needs an https gateway, pid, key and https origin; strips a script path', () => {
    const env = {
      XD_GATEWAY: 'https://pay.example/submit.php',
      XD_PID: '1001',
      XD_KEY: 'k',
      BETTER_AUTH_URL: 'https://readfox.test',
    };
    expect(xiaodouConfigFromEnv(env)?.gateway).toBe('https://pay.example');
    expect(xiaodouConfigFromEnv({ ...env, XD_KEY: '' })).toBeNull();
    expect(xiaodouConfigFromEnv({ ...env, BETTER_AUTH_URL: 'http://localhost:3457' })).toBeNull();
  });
});
