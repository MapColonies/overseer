import { snakeCase } from 'change-case';

export const convertObjectKeysToSnakeCase = (obj: Record<string, unknown>): Record<string, unknown> => {
  const newObj: Record<string, unknown> = {};
  for (const key in obj) {
    const newKey = snakeCase(key);
    newObj[newKey] = obj[key];
  }
  return newObj;
};

/**
 * GPKG has no list type, so ogr2ogr would write array values as OGR StringList text (e.g. `(2:optical,sar)`).
 * Joining them beforehand keeps the stored value readable.
 */
export const convertArrayValuesToDelimitedString = (obj: Record<string, unknown>, separator = ','): Record<string, unknown> => {
  const newObj: Record<string, unknown> = {};
  for (const key in obj) {
    const value = obj[key];
    newObj[key] = Array.isArray(value) ? value.join(separator) : value;
  }
  return newObj;
};
