import { formatBytes, randomUint64 } from './numberUtils';

describe('numberUtils', () => {
  describe('formatBytes', () => {
    it('should format 0 bytes correctly', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
    });

    it('should format bytes correctly', () => {
      expect(formatBytes(123)).toBe('123 Bytes');
    });

    it('should format kilobytes correctly', () => {
      expect(formatBytes(1024)).toBe('1.02 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatBytes(1024 * 1024)).toBe('1.05 MB');
    });

    it('should respect custom decimal places', () => {
      expect(formatBytes(1234567, 1)).toBe('1.2 MB');
      expect(formatBytes(1234567, 3)).toBe('1.235 MB');
    });

    it('should handle negative decimal places', () => {
      expect(formatBytes(1234567, -1)).toBe('1 MB');
    });
  });

  describe('randomUint64', () => {
    it('should return a bigint', () => {
      const result = randomUint64();
      expect(typeof result).toBe('bigint');
    });

    it('should return different values on multiple calls', () => {
      const result1 = randomUint64();
      const result2 = randomUint64();
      expect(result1).not.toBe(result2);
    });
  });
});
