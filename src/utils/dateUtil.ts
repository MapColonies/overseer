import { getUTCDate } from '@map-colonies/mc-utils';

export const createExpirationDate = (days: number): Date => {
  const expirationDate = getUTCDate();
  expirationDate.setDate(expirationDate.getDate() + days);
  return expirationDate;
};
