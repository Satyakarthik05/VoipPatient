/**
 * Web stub for react-native-record-screen
 * Only implements the minimal API your code uses.
 */

export default {
  startRecording: () => {
    console.warn('react-native-record-screen.startRecording called on web, stubbed out.');
    return Promise.reject(new Error('record-screen unavailable on web'));
  },
  stopRecording: () => {
    console.warn('react-native-record-screen.stopRecording called on web, stubbed out.');
    return Promise.reject(new Error('record-screen unavailable on web'));
  },
};
