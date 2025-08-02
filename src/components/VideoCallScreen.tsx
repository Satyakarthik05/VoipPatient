import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  PermissionsAndroid,
  Linking,
  Modal,
  Animated,
} from 'react-native';
import {
  RTCPeerConnection,
  RTCView,
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import InCallManager from 'react-native-incall-manager';
import AudioRecorderPlayer, {
  RecordBackType,
  PlayBackType,
  AVEncoderAudioQualityIOSType,
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  AVEncodingOption,
} from 'react-native-audio-recorder-player';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialIcons';
import Icon2 from 'react-native-vector-icons/FontAwesome';
import Icon3 from 'react-native-vector-icons/MaterialCommunityIcons';
import Sound from 'react-native-sound';

import RNFS from 'react-native-fs';
import moment from 'moment';
import { API_URL } from '../services/service';
import { WS_URL } from '../services/service';

interface VideoCallScreenProps {
  route: {
    params: {
      currentUserId: string;
      otherUserId: string;
      isCaller: boolean;
      otherUserName?: string;
      callerRole: 'DOCTOR' | 'PATIENT';
    };
  };
  navigation: any;
}

// Type declarations
declare module 'react-native' {
  interface PermissionsAndroidStatic {
    shouldShowRequestPermissionRationale(permission: string): Promise<boolean>;
  }
}

declare module 'react-native-audio-recorder-player' {
  interface AudioRecorderPlayer {
    dirs?: {
      CacheDir: string;
      DocumentDir: string;
    };
  }
}

type AndroidPermission =
  | 'android.permission.RECORD_AUDIO'
  | 'android.permission.READ_MEDIA_AUDIO'
  | 'android.permission.READ_EXTERNAL_STORAGE'
  | 'android.permission.WRITE_EXTERNAL_STORAGE';

type ErrorWithMessage = {
  message: string;
};

const VideoCallScreen: React.FC<VideoCallScreenProps> = ({
  route,
  navigation,
}) => {
  const { currentUserId, otherUserId, isCaller, otherUserName, callerRole } =
    route.params;

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState(
    isCaller ? 'Calling...' : 'Connecting...',
  );
  const [callConnected, setCallConnected] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isFrontCamera, setIsFrontCamera] = useState(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [callDuration, setCallDuration] = useState('00:00:00');
  const [recordTime, setRecordTime] = useState('00:00:00');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [currentRecordingPath, setCurrentRecordingPath] = useState<
    string | null
  >(null);
  const audioRecorderPlayer = useRef(AudioRecorderPlayer).current;
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [showUnmuteRequest, setShowUnmuteRequest] = useState(false);
  const [showUnmuteModal, setShowUnmuteModal] = useState(false);
  const [videoViewsSwapped, setVideoViewsSwapped] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // const [videoViewsSwapped, setVideoViewsSwapped] = useState(false);
  const controlsPosition = useRef(new Animated.Value(0)).current;

  const pc = useRef<RTCPeerConnection | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const hasEndedCall = useRef(false);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  const callStartRef = useRef<Date | null>(null);

  const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };
  const waitingSound = useRef<Sound | null>(null);

  // Initialize waiting sound
  const initWaitingSound = () => {
    waitingSound.current = new Sound(
      'waiting.mp3',
      Sound.MAIN_BUNDLE,
      error => {
        if (error) {
          console.error('Failed to load waiting sound', error);
          return;
        }
        if (!callConnected && !hasEndedCall.current) {
          waitingSound.current?.setNumberOfLoops(-1);
          waitingSound.current?.play();
        }
      },
    );
  };

  // Update the cleanup effect
  useEffect(() => {
    initWaitingSound();

    return () => {
      if (waitingSound.current) {
        waitingSound.current.stop();
        waitingSound.current.release();
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  // Helper function to properly type errors
  const isErrorWithMessage = (error: unknown): error is ErrorWithMessage => {
    return (
      typeof error === 'object' &&
      error !== null &&
      'message' in error &&
      typeof (error as Record<string, unknown>).message === 'string'
    );
  };

  const getErrorMessage = (error: unknown): string => {
    if (isErrorWithMessage(error)) return error.message;
    return 'An unknown error occurred';
  };

  useEffect(() => {
    audioRecorderPlayer.setSubscriptionDuration(0.1);
    return () => {
      cleanupResources();
    };
  }, []);

  const getAudioFilePath = async (): Promise<string> => {
    const fileName = `recording_${Date.now()}.mp3`;
    let basePath = RNFS.CachesDirectoryPath;

    // Ensure the directory exists
    try {
      const dirExists = await RNFS.exists(basePath);
      if (!dirExists) {
        await RNFS.mkdir(basePath);
      }
      return `${basePath}/${fileName}`;
    } catch (error) {
      console.error('Error creating directory:', error);
      throw new Error('Failed to create recording directory');
    }
  };

  const getRequiredPermissions = (): AndroidPermission[] => {
    const sdkInt =
      typeof Platform.Version === 'string'
        ? parseInt(Platform.Version, 10)
        : Platform.Version;

    const permissions: AndroidPermission[] = [
      'android.permission.RECORD_AUDIO',
    ];

    if (sdkInt < 33) {
      permissions.push('android.permission.WRITE_EXTERNAL_STORAGE');
    }

    return permissions;
  };

  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;

    try {
      const permissions = getRequiredPermissions();
      const grantedStatus = await Promise.all(
        permissions.map(perm => PermissionsAndroid.check(perm)),
      );

      if (grantedStatus.every(status => status)) {
        return true;
      }

      const results = await PermissionsAndroid.requestMultiple(permissions);
      const allGranted = permissions.every(
        perm => results[perm] === PermissionsAndroid.RESULTS.GRANTED,
      );

      if (!allGranted) {
        const neverAskAgainPermissions = permissions.filter(
          perm => results[perm] === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN,
        );
        if (neverAskAgainPermissions.length > 0) {
          setPermissionDenied(true);
          Alert.alert(
            'Permission Required',
            'Microphone access is required for call recording',
            [
              { text: 'Continue Without', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        }
      }
      return allGranted;
    } catch (error) {
      console.error('Permission error:', error);
      return false;
    }
  };

  const startRecording = async () => {
    try {
      const hasPermission = await requestPermissions();
      if (!hasPermission && permissionDenied) {
        return;
      }

      const path = await getAudioFilePath();
      setCurrentRecordingPath(path);

      const audioSet = {
        AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
        AudioSourceAndroid: AudioSourceAndroidType.MIC,
        AVEncoderAudioQualityKeyIOS: AVEncoderAudioQualityIOSType.high,
        AVNumberOfChannelsKeyIOS: 2,
        AVFormatIDKeyIOS: 'aac' as AVEncodingOption,
      };

      await audioRecorderPlayer.startRecorder(path, audioSet);
      audioRecorderPlayer.addRecordBackListener((e: RecordBackType) => {
        setRecordTime(
          audioRecorderPlayer.mmssss(Math.floor(e.currentPosition)),
        );
      });

      setIsRecording(true);
    } catch (error) {
      console.error('Recording error:', error);
      Alert.alert('Error', 'Could not start recording');
    }
  };

  const stopRecording = async (): Promise<string | null> => {
    try {
      if (!currentRecordingPath) {
        throw new Error('No active recording path');
      }

      await audioRecorderPlayer.stopRecorder();
      audioRecorderPlayer.removeRecordBackListener();
      setIsRecording(false);
      setRecordTime('00:00:00');

      // Verify the file exists and has content
      const fileExists = await RNFS.exists(currentRecordingPath);
      if (!fileExists) {
        throw new Error('Recording file not found');
      }

      const fileInfo = await RNFS.stat(currentRecordingPath);
      if (fileInfo.size === 0) {
        await RNFS.unlink(currentRecordingPath);
        throw new Error('Recording file is empty');
      }

      return currentRecordingPath;
    } catch (error) {
      console.error('Stop recording error:', error);
      return null;
    } finally {
      setCurrentRecordingPath(null);
    }
  };

  const uploadAudioRecording = async (filePath: string) => {
    try {
      const fileData = await RNFS.readFile(filePath, 'base64');
      const duration = calculateDuration();

      const response = await fetch(`${API_URL}/api/calls/save`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callerId: isCaller ? currentUserId : otherUserId,
          receiverId: isCaller ? otherUserId : currentUserId,
          startTime: callStartTime?.toISOString() || new Date().toISOString(),
          endTime: new Date().toISOString(),
          duration,
          recording: fileData,
          fileName: filePath.split('/').pop(),
          endedBy: callerRole,
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with status ${response.status}`);
      }

      // Clean up file after successful upload
      await RNFS.unlink(filePath).catch(e =>
        console.log('Error deleting recording file:', e),
      );

      return true;
    } catch (error) {
      console.error('Upload error:', error);
      return false;
    }
  };

  const cleanupResources = async () => {
    try {
      if (isRecording) {
        const savedPath = await stopRecording();
        if (savedPath) {
          await uploadAudioRecording(savedPath);
        }
      }

      if (pc.current) {
        pc.current.close();
        pc.current = null;
      }

      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }

      if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        setRemoteStream(null);
      }

      InCallManager.stop();
      InCallManager.setSpeakerphoneOn(false);
      stopDurationTimer();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  };

  const calculateDuration = () => {
    if (!callStartRef.current) return '00:00:00';
    const endTime = new Date();
    const duration = moment.duration(
      moment(endTime).diff(moment(callStartRef.current)),
    );
    return moment.utc(duration.asMilliseconds()).format('HH:mm:ss');
  };

  const startDurationTimer = () => {
    stopDurationTimer();
    callStartRef.current = new Date();
    setCallStartTime(new Date());
    durationInterval.current = setInterval(() => {
      setCallDuration(calculateDuration());
    }, 1000);
  };

  const stopDurationTimer = () => {
    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }
  };

 useEffect(() => {
  if (callConnected) {
    controlsTimeoutRef.current = setTimeout(() => {
      hideControls();
    }, 3000);
  }
  return () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
  };
}, [callConnected]);

 const handleScreenPress = () => {
  // Show controls with animation
  Animated.timing(controlsPosition, {
    toValue: 0,
    duration: 300,
    useNativeDriver: true,
  }).start(() => {
    setControlsVisible(true);
  });
  
  // Auto-hide after 3 seconds
  if (controlsTimeoutRef.current) {
    clearTimeout(controlsTimeoutRef.current);
  }
  controlsTimeoutRef.current = setTimeout(() => {
    hideControls();
  }, 3000);
};


const hideControls = () => {
  Animated.timing(controlsPosition, {
    toValue: 100, // Adjust this value based on your controls height
    duration: 500,
    useNativeDriver: true,
  }).start(() => {
    setControlsVisible(false);
  });
};


  const endCall = async (remoteEnded: boolean = false) => {
    if (hasEndedCall.current) return;
    hasEndedCall.current = true;

    await cleanupResources();
    if (waitingSound.current) {
      waitingSound.current.stop();
      waitingSound.current.release();
      waitingSound.current = null;
    }

    // Send end call message if we're initiating the end
    if (
      !remoteEnded &&
      ws.current &&
      ws.current.readyState === WebSocket.OPEN
    ) {
      ws.current.send(
        JSON.stringify({
          type: 'end_call',
          from: currentUserId,
          to: otherUserId,
          endedBy: callerRole,
        }),
      );
    }

    // Close WebSocket connection
    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    // Navigate back with appropriate message
    if (remoteEnded) {
      Alert.alert(
        'Call Ended',
        `The ${
          callerRole === 'DOCTOR' ? 'doctor' : 'patient'
        } has ended the call`,
        [{ text: 'OK', onPress: () => navigation.goBack() }],
      );
    } else {
      navigation.goBack();
    }
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        audioTracks[0].enabled = !audioTracks[0].enabled;
        const newMuteStatus = !audioTracks[0].enabled;
        setIsMuted(newMuteStatus);

        // Send mute status to other user
        if (ws.current && ws.current.readyState === WebSocket.OPEN) {
          ws.current.send(
            JSON.stringify({
              type: 'mute_status',
              from: currentUserId,
              to: otherUserId,
              isMuted: newMuteStatus,
            }),
          );
        }
      }
    }
  };

  const requestUnmute = () => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: 'unmute_request',
          from: currentUserId,
          to: otherUserId,
        }),
      );
      setShowUnmuteRequest(false);
    }
  };

  const handleUnmuteRequest = (accept: boolean) => {
    setShowUnmuteModal(false);
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(
        JSON.stringify({
          type: 'unmute_response',
          from: currentUserId,
          to: otherUserId,
          accepted: accept,
        }),
      );

      if (accept) {
        toggleMute(); // Unmute if accepting the request
      }
    }
  };

  const toggleSpeaker = () => {
    const newState = !isSpeakerOn;
    InCallManager.setSpeakerphoneOn(newState);
    setIsSpeakerOn(newState);
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks[0].enabled = !videoTracks[0].enabled;
        setIsVideoOn(videoTracks[0].enabled);
      }
    }
  };
  const switchCamera = async () => {
    if (!localStream) return;

    try {
      const newCameraType = isFrontCamera ? 'back' : 'front';
      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: newCameraType === 'front' ? 'user' : 'environment',
          width: 640,
          height: 480,
          frameRate: 30,
        },
        audio: true,
      });

      // Get the new video track
      const newVideoTrack = stream.getVideoTracks()[0];

      // Replace the track in the peer connection
      const senders = pc.current?.getSenders();
      const videoSender = senders?.find(s => s.track?.kind === 'video');

      if (videoSender) {
        await videoSender.replaceTrack(newVideoTrack);
      }

      // Stop the old tracks
      localStream.getTracks().forEach(track => track.stop());

      // Create new stream with new video track and existing audio track
      const newStream = new MediaStream();
      newStream.addTrack(newVideoTrack);

      // Keep the same audio track if it exists
      const audioTracks = localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        newStream.addTrack(audioTracks[0]);
      }

      // Update local stream state
      setLocalStream(newStream);
      setIsFrontCamera(!isFrontCamera);

      // Stop the unused tracks from the new stream
      stream
        .getTracks()
        .filter(track => track !== newVideoTrack)
        .forEach(track => track.stop());
    } catch (error) {
      console.error('Error switching camera:', error);
      Alert.alert('Camera Error', 'Failed to switch camera');
    }
  };

  const setupWebSocket = () => {
    ws.current = new WebSocket(`${WS_URL}/signal`);

    ws.current.onopen = () => {
      console.log('WebSocket connected');
      ws.current?.send(
        JSON.stringify({
          type: 'join',
          userId: currentUserId,
          role: callerRole,
        }),
      );

      if (isCaller) {
        setupMedia();
      } else {
        ws.current?.send(
          JSON.stringify({
            type: 'call_accepted',
            from: currentUserId,
            to: otherUserId,
          }),
        );
        setupMedia();
      }
    };

    ws.current.onmessage = async message => {
      const data = JSON.parse(message.data);
      console.log('WebSocket message received:', data.type);

      try {
        switch (data.type) {
          case 'offer':
            if (!pc.current) return;
            await pc.current.setRemoteDescription(
              new RTCSessionDescription(data.offer),
            );
            const answer = await pc.current.createAnswer();
            await pc.current.setLocalDescription(answer);
            ws.current?.send(
              JSON.stringify({
                type: 'answer',
                answer,
                target: otherUserId,
              }),
            );
            setStatus('Connected');
            if (waitingSound.current) {
              waitingSound.current.stop();
              waitingSound.current.release();
              waitingSound.current = null;
            }

            setCallConnected(true);
            if (isCaller) startRecording();
            break;

          case 'answer':
            if (!pc.current) return;
            await pc.current.setRemoteDescription(
              new RTCSessionDescription(data.answer),
            );
            setStatus('Connected');
            if (waitingSound.current) {
              waitingSound.current.stop();
              waitingSound.current.release();
              waitingSound.current = null;
            }

            setCallConnected(true);
            if (!isCaller) startRecording();
            break;

          case 'candidate':
            if (pc.current && data.candidate) {
              await pc.current.addIceCandidate(
                new RTCIceCandidate(data.candidate),
              );
            }
            break;
          case 'mute_status':
            setIsRemoteMuted(data.isMuted);
            setShowUnmuteRequest(false); // Hide request button if remote user unmutes
            break;

          case 'unmute_request':
            if (isMuted) {
              setShowUnmuteModal(true);
            }
            break;

          case 'unmute_response':
            if (data.accepted) {
              Alert.alert(
                'Unmute Request Accepted',
                'The other user has unmuted',
              );
            } else {
              Alert.alert(
                'Unmute Request Denied',
                'The other user chose to remain muted',
              );
            }
            break;
          case 'end_call':
            endCall(true);
            break;
        }
      } catch (error) {
        console.error('WebRTC signaling error:', error);
        endCall();
      }
    };

    ws.current.onerror = error => {
      console.error('WebSocket error:', error);
      Alert.alert('Connection Error', 'Failed to connect to signaling server');
      endCall();
    };

    ws.current.onclose = () => {
      console.log('WebSocket closed');
      if (!hasEndedCall.current) {
        endCall();
      }
    };
  };

  const setupMedia = async (cameraType: 'front' | 'back' = 'front') => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.CAMERA,
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        ]);

        if (
          granted['android.permission.CAMERA'] !==
            PermissionsAndroid.RESULTS.GRANTED ||
          granted['android.permission.RECORD_AUDIO'] !==
            PermissionsAndroid.RESULTS.GRANTED
        ) {
          Alert.alert(
            'Permissions Required',
            'Camera and Microphone access is needed',
          );
          endCall();
          return;
        }
      }

      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: cameraType === 'front' ? 'user' : 'environment',
          width: 640,
          height: 480,
          frameRate: 30,
        },
        audio: true,
      });

      if (!pc.current) {
        pc.current = new RTCPeerConnection(configuration);

        (pc.current as any).onicecandidate = (event: any) => {
          if (event.candidate) {
            ws.current?.send(
              JSON.stringify({
                type: 'candidate',
                candidate: event.candidate,
                target: otherUserId,
              }),
            );
          }
        };

        (pc.current as any).ontrack = (event: any) => {
          if (event.streams && event.streams.length > 0) {
            const remote = event.streams[0];
            setRemoteStream(remote);
            setStatus('Connected');
            setCallConnected(true);

            // Start timer when remote stream is received
            if (!callStartRef.current) {
              startDurationTimer();
            }

            InCallManager.start({ media: 'audio' });
            InCallManager.setSpeakerphoneOn(true);
          }
        };
      }

      stream.getTracks().forEach(track => {
        pc.current?.addTrack(track, stream);
      });

      setLocalStream(stream);

      if (isCaller && !callConnected && pc.current) {
        const offer = await pc.current.createOffer({});
        await pc.current.setLocalDescription(offer);
        ws.current?.send(
          JSON.stringify({
            type: 'offer',
            offer,
            target: otherUserId,
          }),
        );
      }
    } catch (error) {
      console.error('Media setup error:', error);
      Alert.alert('Media Error', 'Could not access camera or microphone');
      endCall();
    }
  };

  useEffect(() => {
    setupWebSocket();

    return () => {
      if (!hasEndedCall.current) {
        endCall();
      }
    };
  }, []);
  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handleScreenPress}
      style={{ flex: 1 }}
    >
      <LinearGradient
        colors={['#0f2027', '#203a43', '#2c5364']}
        style={styles.container}
      >
        {/* Remote video or placeholder */}
        {remoteStream ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={styles.remoteVideo}
            objectFit="cover"
          />
        ) : (
          <LinearGradient
            colors={['rgba(15, 32, 39, 0.8)', 'rgba(32, 58, 67, 0.8)']}
            style={styles.remoteVideoPlaceholder}
          >
            <View style={styles.userAvatar}>
              <Icon2 name="user" size={80} color="#fff" />
            </View>
            <Text style={styles.statusText}>
              {status} {otherUserName ? `with ${otherUserName}` : ''}
            </Text>
          </LinearGradient>
        )}

        {/* Local video */}
        {localStream && isVideoOn && (
          <View style={styles.localVideoContainer}>
            <RTCView
              streamURL={localStream.toURL()}
              style={styles.localVideo}
              objectFit="cover"
              mirror={isFrontCamera}
              zOrder={1}
            />
          </View>
        )}

        {/* Call duration */}
        <View style={styles.durationContainer}>
          <Icon name="access-time" size={20} color="#fff" />
          <Text style={styles.durationText}>{callDuration}</Text>
        </View>

        {/* Mute indicators */}
        {isRemoteMuted && !isMuted && (
          <View style={styles.remoteMuteIndicator}>
            <Icon name="mic-off" size={16} color="#fff" />
            <Text style={styles.remoteMuteText}>Other user is muted</Text>
            {!isCaller && (
              <TouchableOpacity
                onPress={() => setShowUnmuteRequest(true)}
                style={styles.unmuteRequestButton}
              >
                <Text style={styles.unmuteRequestText}>Request Unmute</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {isMuted && (
          <View
            style={[
              styles.remoteMuteIndicator,
              { backgroundColor: 'rgba(0,100,255,0.7)' },
            ]}
          >
            <Icon name="mic-off" size={16} color="#fff" />
            <Text style={styles.remoteMuteText}>You are muted</Text>
          </View>
        )}

        {/* Unmute request modal */}
        <Modal
          visible={showUnmuteModal}
          transparent={true}
          animationType="fade"
        >
          <View style={styles.modalOverlay}>
            <LinearGradient
              colors={['#2c5364', '#203a43']}
              style={styles.modalContent}
            >
              <View style={styles.modalHeader}>
                <Icon name="info-outline" size={24} color="#fff" />
                <Text style={styles.modalTitle}>Unmute Request</Text>
              </View>
              <Text style={styles.modalText}>
                The other user is requesting you to unmute your microphone
              </Text>
              <View style={styles.modalButtonContainer}>
                <TouchableOpacity
                  onPress={() => handleUnmuteRequest(false)}
                  style={[styles.modalButton, styles.declineButton]}
                >
                  <Icon name="close" size={18} color="#fff" />
                  <Text style={styles.modalButtonText}>Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleUnmuteRequest(true)}
                  style={[styles.modalButton, styles.acceptButton]}
                >
                  <Icon name="check" size={18} color="#fff" />
                  <Text style={styles.modalButtonText}>Accept</Text>
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>
        </Modal>

        {controlsVisible && (
  <Animated.View 
    style={[
      styles.controlsContainer,
      {
        transform: [{
          translateY: controlsPosition.interpolate({
            inputRange: [0, 100],
            outputRange: [0, 100],
          }),
        }],
      },
    ]}
  >
          <LinearGradient
            colors={['rgba(15, 32, 39, 0.9)', 'rgba(32, 58, 67, 0.9)']}
            style={styles.controlsContainer}
          >
            <View style={styles.controlsRow}>
              <TouchableOpacity
                onPress={toggleMute}
                style={styles.controlButton}
              >
                <LinearGradient
                  colors={
                    isMuted ? ['#ff5e62', '#ff9966'] : ['#4b6cb7', '#182848']
                  }
                  style={styles.buttonCircle}
                >
                  <Icon
                    name={isMuted ? 'mic-off' : 'mic'}
                    size={24}
                    color="#fff"
                  />
                </LinearGradient>
                <Text style={styles.controlButtonText}>
                  {isMuted ? 'Unmute' : 'Mute'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleSpeaker}
                style={styles.controlButton}
              >
                <LinearGradient
                  colors={
                    isSpeakerOn
                      ? ['#2193b0', '#6dd5ed']
                      : ['#4b6cb7', '#182848']
                  }
                  style={styles.buttonCircle}
                >
                  <Icon3
                    name={isSpeakerOn ? 'speaker' : 'speaker-off'}
                    size={24}
                    color="#fff"
                  />
                </LinearGradient>
                <Text style={styles.controlButtonText}>
                  {isSpeakerOn ? 'Speaker' : 'Earpiece'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={toggleVideo}
                style={styles.controlButton}
              >
                <LinearGradient
                  colors={
                    isVideoOn ? ['#2193b0', '#6dd5ed'] : ['#4b6cb7', '#182848']
                  }
                  style={styles.buttonCircle}
                >
                  <Icon
                    name={isVideoOn ? 'videocam' : 'videocam-off'}
                    size={24}
                    color="#fff"
                  />
                </LinearGradient>
                <Text style={styles.controlButtonText}>
                  {isVideoOn ? 'Video On' : 'Video Off'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={switchCamera}
                style={styles.controlButton}
              >
                <LinearGradient
                  colors={['#4b6cb7', '#182848']}
                  style={styles.buttonCircle}
                >
                  <Icon name="flip-camera-android" size={24} color="#fff" />
                </LinearGradient>
                <Text style={styles.controlButtonText}>Flip</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => endCall()}
              style={styles.endCallButton}
            >
              <LinearGradient
                colors={['#ff416c', '#ff4b2b']}
                style={styles.endCallGradient}
              >
                <Icon name="call-end" size={30} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </LinearGradient>
         </Animated.View>
)}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  remoteVideo: {
    flex: 1,
    backgroundColor: '#000',
  },
  remoteVideoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  localVideoContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 100,
    height: 140,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  localVideo: {
    width: '100%',
    height: '100%',
  },
  statusText: {
    color: 'white',
    fontSize: 18,
    marginTop: 10,
    fontWeight: '500',
  },
  durationContainer: {
    position: 'absolute',
    top: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  durationText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  controlButton: {
    alignItems: 'center',
  },
  buttonCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  controlButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  endCallButton: {
    alignSelf: 'center',
    width: 70,
    height: 70,
    borderRadius: 35,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    overflow: 'hidden',
  },
  endCallGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  remoteMuteIndicator: {
    position: 'absolute',
    top: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,50,50,0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    elevation: 3,
  },
  remoteMuteText: {
    color: 'white',
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
  unmuteRequestButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 15,
    marginLeft: 10,
  },
  unmuteRequestText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  modalContent: {
    borderRadius: 15,
    width: '80%',
    padding: 20,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 10,
    color: '#fff',
  },
  modalText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 25,
    lineHeight: 22,
  },
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    width: '48%',
  },
  acceptButton: {
    backgroundColor: '#4CAF50',
  },
  declineButton: {
    backgroundColor: '#F44336',
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 8,
    fontSize: 16,
  },
});

export default VideoCallScreen;
