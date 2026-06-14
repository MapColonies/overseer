import path from 'node:path';

export const buildUrl = (baseUrl: string, ...pathSegments: string[]): string => {
  const url = new URL(baseUrl);
  url.pathname = path.posix.join(url.pathname, ...pathSegments);
  return url.href;
};
