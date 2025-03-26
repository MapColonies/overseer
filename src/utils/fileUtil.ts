export const fileExtensionExtractor = (fileName: string): string => {
  const parts = fileName.split('.');
  const extension = parts[parts.length - 1];
  return extension;
};
