import { snakeCase } from 'change-case';

export const convertObjectKeysToSnakeCase = (obj: Record<string, unknown>): Record<string, unknown> => {
  const newObj: Record<string, unknown> = {};
  for (const key in obj) {
    const newKey = snakeCase(key);
    newObj[newKey] = obj[key];
  }
  return newObj;
};

export const convertArrayValuesToDelimitedString = (obj: Record<string, unknown>, separator = ','): Record<string, unknown> => {
  const newObj: Record<string, unknown> = {};
  for (const key in obj) {
    const value = obj[key];
    newObj[key] = Array.isArray(value) ? value.join(separator) : value;
  }
  return newObj;
};
