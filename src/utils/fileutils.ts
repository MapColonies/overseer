// import { stat } from 'fs/promises';

export const fileExtensionExtractor = (fileName: string): string => {
  const parts = fileName.split('.');
  const extension = parts[parts.length - 1];
  return extension;
};

// TODO: Use this function later
// export const getFileSize = async (filePath: string): Promise<number> => {
//   const fileSizeInBytes = (await stat(filePath)).size;
//   return Math.trunc(fileSizeInBytes);
// };
