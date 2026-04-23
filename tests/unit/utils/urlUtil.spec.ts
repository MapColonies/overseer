import { buildUrl } from '../../../src/utils/urlUtil';

const BASE_URL = 'http://example.com';
const BASE_URL_WITH_SLASH = `${BASE_URL}/`;
const BASE_URL_WITH_PATH = `${BASE_URL}/api`;

describe('buildUrl', () => {
  describe('basic path joining', () => {
    it('should return the base URL unchanged when no path segments are provided', () => {
      const result = buildUrl(BASE_URL_WITH_SLASH);
      expect(result).toBe(BASE_URL_WITH_SLASH);
    });

    it('should append a single path segment to the base URL', () => {
      const result = buildUrl(BASE_URL_WITH_SLASH, 'api');
      expect(result).toBe(`${BASE_URL}/api`);
    });

    it('should append multiple path segments to the base URL', () => {
      const result = buildUrl(BASE_URL_WITH_SLASH, 'api', 'v1', 'resource');
      expect(result).toBe(`${BASE_URL}/api/v1/resource`);
    });
  });

  describe('base URL with existing path', () => {
    it('should join path segments to a base URL that already has a path', () => {
      const result = buildUrl(BASE_URL_WITH_PATH, 'v1');
      expect(result).toBe(`${BASE_URL_WITH_PATH}/v1`);
    });

    it('should join multiple segments to a base URL with existing path', () => {
      const result = buildUrl(`${BASE_URL}/api/v1`, 'resource', '123');
      expect(result).toBe(`${BASE_URL}/api/v1/resource/123`);
    });
  });

  describe('path segments with slashes', () => {
    it('should handle path segments with leading slashes', () => {
      const result = buildUrl(BASE_URL_WITH_SLASH, '/api', '/v1');
      expect(result).toBe(`${BASE_URL}/api/v1`);
    });

    it('should handle path segments with trailing slashes', () => {
      const result = buildUrl(BASE_URL_WITH_SLASH, 'api/', 'v1/');
      expect(result).toBe(`${BASE_URL}/api/v1/`);
    });

    it('should handle a base URL with a trailing slash and a segment with a leading slash', () => {
      const result = buildUrl(BASE_URL_WITH_SLASH, '/segment');
      expect(result).toBe(`${BASE_URL}/segment`);
    });
  });

  describe('URL preservation', () => {
    it('should preserve the protocol', () => {
      const httpsBase = 'https://example.com/';
      const result = buildUrl(httpsBase, 'secure');
      expect(result).toBe('https://example.com/secure');
    });

    it('should preserve the port', () => {
      const baseWithPort = `${BASE_URL}:8080/`;
      const result = buildUrl(baseWithPort, 'api');
      expect(result).toBe(`${BASE_URL}:8080/api`);
    });

    it('should preserve query parameters from the base URL', () => {
      const result = buildUrl(`${BASE_URL_WITH_PATH}?token=abc`, 'resource');
      expect(result).toBe(`${BASE_URL_WITH_PATH}/resource?token=abc`);
    });
  });

  describe('path normalization', () => {
    it('should resolve dot-dot segments', () => {
      const result = buildUrl(`${BASE_URL}/api/v1`, '..', 'v2');
      expect(result).toBe(`${BASE_URL}/api/v2`);
    });

    it('should resolve current-directory dot segments', () => {
      const result = buildUrl(BASE_URL_WITH_PATH, '.', 'resource');
      expect(result).toBe(`${BASE_URL_WITH_PATH}/resource`);
    });
  });
});
