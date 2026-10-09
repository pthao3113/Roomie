import { describe, it, expect } from 'vitest';
import { AddressNormalizer } from './address-normalizer.util.js';

describe('AddressNormalizer Unit Suite', () => {
  it('1. Should correctly normalize Vietnamese address with accents and đ/Đ', () => {
    const raw = '123 Đ. Nguyễn Văn Cừ, P.2, Q.5';
    const normalized = AddressNormalizer.normalize(raw);
    expect(normalized).toBe('123 duong nguyen van cu phuong 2 quan 5');
  });

  it('2. Should match different abbreviation representations of the same location', () => {
    const addr1 = '123 Đ. Nguyễn Văn Cừ, P.2, Q.5';
    const addr2 = '123 Đường Nguyễn Văn Cừ, Phường 2, Quận 5';
    expect(AddressNormalizer.isMatch(addr1, addr2)).toBe(true);
  });
});
