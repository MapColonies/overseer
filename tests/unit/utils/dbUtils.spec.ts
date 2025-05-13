/* eslint-disable @typescript-eslint/naming-convention */
import { convertObjectKeysToSnakeCase } from '../../../src/utils/db/dbUtils';

describe('dbUtils', () => {
  describe('convertObjectKeysToSnakeCase', () => {
    it('should convert camelCase keys to snake_case', () => {
      const input = { firstName: 'John', lastName: 'Doe' };
      const expected = { first_name: 'John', last_name: 'Doe' };
      expect(convertObjectKeysToSnakeCase(input)).toEqual(expected);
    });

    it('should handle empty objects', () => {
      const input = {};
      const expected = {};
      expect(convertObjectKeysToSnakeCase(input)).toEqual(expected);
    });

    it('should handle PascalCase keys', () => {
      const input = { FirstName: 'John', LastName: 'Doe' };
      const expected = { first_name: 'John', last_name: 'Doe' };
      expect(convertObjectKeysToSnakeCase(input)).toEqual(expected);
    });

    it('should handle keys with numbers', () => {
      const input = { user1Name: 'John', address2Line: 'Street' };
      const expected = { user1_name: 'John', address2_line: 'Street' };
      expect(convertObjectKeysToSnakeCase(input)).toEqual(expected);
    });

    it('should preserve nested object values', () => {
      const nestedObj = { nestedKey: 'value' };
      const input = { topLevelKey: nestedObj };
      const expected = { top_level_key: nestedObj };
      expect(convertObjectKeysToSnakeCase(input)).toEqual(expected);
    });

    it('should handle keys that are already snake_case', () => {
      const input = { first_name: 'John', last_name: 'Doe' };
      const expected = { first_name: 'John', last_name: 'Doe' };
      expect(convertObjectKeysToSnakeCase(input)).toEqual(expected);
    });
  });
});
