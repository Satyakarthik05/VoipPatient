/**
 * Web stub for react-native-fs
 * Only implements the minimal API your code uses.
 */

export const DocumentDirectoryPath = '';

export function moveFile(srcPath, destPath) {
  console.warn('react-native-fs.moveFile called on web, stubbed out.');
  return Promise.reject(new Error('react-native-fs unavailable on web'));
}
