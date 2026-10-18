import { parseEnv } from './load-env';

describe('parseEnv', () => {
  it('reads values, skips comments and blanks, strips quotes, keeps empty values', () => {
    const out = parseEnv('# c\nPORT=3000\r\n\nA="x y"\nB=\nURL=https://a.co/?q=1\n');
    expect(out).toEqual({ PORT: '3000', A: 'x y', B: '', URL: 'https://a.co/?q=1' });
  });
});
