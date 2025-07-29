/**
 * Web stub for react-native-webrtc
 * Throws on any RTCPeerConnection usage to indicate web is unsupported,
 * and provides no-op implementations for mediaDevices and RTCView.
 */

export class RTCPeerConnection {
  constructor() {
    console.warn('RTCPeerConnection is not available on web.');
    throw new Error('RTCPeerConnection unavailable on web');
  }

  // Stub out common methods to satisfy import but not to function
  addTrack() { }
  createOffer() { return Promise.reject('Not supported'); }
  createAnswer() { return Promise.reject('Not supported'); }
  setLocalDescription() { return Promise.reject('Not supported'); }
  setRemoteDescription() { return Promise.reject('Not supported'); }
  addIceCandidate() { return Promise.reject('Not supported'); }
  close() { }
}

export const mediaDevices = {
  /**
   * getUserMedia stub: always rejects on web
   */
  getUserMedia: (constraints) => {
    console.warn('getUserMedia is not available on web');
    return Promise.reject(new Error('getUserMedia unavailable on web'));
  }
};

/**
 * RTCView stub: renders nothing on web
 */
export const RTCView = (props) => null;
