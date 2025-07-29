import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  PermissionsAndroid,
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
  AudioEncoderAndroidType,
  AudioSourceAndroidType,
  OutputFormatAndroidType,
} from 'react-native-audio-recorder-player';

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
  const [audioPath, setAudioPath] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [callStartTime, setCallStartTime] = useState<Date | null>(null);
  const [callDuration, setCallDuration] = useState('00:00:00');

  const pc = useRef<RTCPeerConnection | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const hasEndedCall = useRef(false);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  const callStartRef = useRef<Date | null>(null);
const audioRecorderPlayer = useRef(AudioRecorderPlayer);


  const configuration = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };

  const prepareAudioPath = () => {
    const path = `${RNFS.DocumentDirectoryPath}/call_${currentUserId}_${Date.now()}.mp3`;
    setAudioPath(path);
    return path;
  };

  const startAudioRecording = async () => {
    try {
      const path = prepareAudioPath();
      
      await audioRecorderPlayer.current.startRecorder(path, {
        AudioEncoderAndroid: AudioEncoderAndroidType.AAC,
        AudioSourceAndroid: AudioSourceAndroidType.MIC,
        OutputFormatAndroid: OutputFormatAndroidType.MPEG_4,
      });
      
      setIsRecording(true);
    } catch (error) {
      console.error('Failed to start audio recording:', error);
    }
  };

  const stopAudioRecording = async () => {
    if (!isRecording) return null;

    try {
      const result = await audioRecorderPlayer.current.stopRecorder();
      setIsRecording(false);
      return result;
    } catch (error) {
      console.error('Failed to stop audio recording:', error);
      setIsRecording(false);
      return null;
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
        throw new Error('Failed to upload recording');
      }

      return true;
    } catch (error) {
      console.error('Upload error:', error);
      return false;
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

  const cleanupResources = async () => {
    try {
      // Stop audio recording if active
      if (isRecording) {
        const savedPath = await stopAudioRecording();
        if (savedPath) {
          await uploadAudioRecording(savedPath);
        }
      }

      // Close peer connection
      if (pc.current) {
        pc.current.close();
        pc.current = null;
      }

      // Stop local media
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }

      // Stop remote media
      if (remoteStream) {
        remoteStream.getTracks().forEach(track => track.stop());
        setRemoteStream(null);
      }

      // Stop audio management
      InCallManager.stop();
      InCallManager.setSpeakerphoneOn(false);
      stopDurationTimer();
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  };

  const endCall = async (remoteEnded: boolean = false) => {
    if (hasEndedCall.current) return;
    hasEndedCall.current = true;

    await cleanupResources();

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
        setIsMuted(!audioTracks[0].enabled);
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

    const newCameraType = isFrontCamera ? 'back' : 'front';
    setIsFrontCamera(!isFrontCamera);

    try {
      const stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: newCameraType === 'front' ? 'user' : 'environment',
          width: 640,
          height: 480,
          frameRate: 30,
        },
        audio: true,
      });

      // Replace the video track
      const videoTrack = stream.getVideoTracks()[0];
      const sender = pc.current
        ?.getSenders()
        .find(s => s.track?.kind === 'video');
      if (sender) {
        sender.replaceTrack(videoTrack);
      }

      // Update local stream
      localStream.getVideoTracks().forEach(track => track.stop());
      localStream.addTrack(videoTrack);
      setLocalStream(new MediaStream([...localStream.getTracks()]));
    } catch (error) {
      console.error('Error switching camera:', error);
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
            setCallConnected(true);
            if (isCaller) startAudioRecording();
            break;

          case 'answer':
            if (!pc.current) return;
            await pc.current.setRemoteDescription(
              new RTCSessionDescription(data.answer),
            );
            setStatus('Connected');
            setCallConnected(true);
            if (!isCaller) startAudioRecording();
            break;

          case 'candidate':
            if (pc.current && data.candidate) {
              await pc.current.addIceCandidate(
                new RTCIceCandidate(data.candidate),
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
    <View style={styles.container}>
      {remoteStream ? (
        <RTCView
          streamURL={remoteStream.toURL()}
          style={styles.remoteVideo}
          objectFit="cover"
        />
      ) : (
        <View style={styles.remoteVideoPlaceholder}>
          <Text style={styles.statusText}>
            {status} {otherUserName ? `with ${otherUserName}` : ''}
          </Text>
        </View>
      )}

      {localStream && isVideoOn && (
        <RTCView
          streamURL={localStream.toURL()}
          style={styles.localVideo}
          objectFit="cover"
          mirror={isFrontCamera}
          zOrder={1}
        />
      )}

      <View style={styles.durationContainer}>
        <Text style={styles.durationText}>{callDuration}</Text>
      </View>

      <View style={styles.controlsContainer}>
        <TouchableOpacity onPress={toggleMute} style={styles.controlButton}>
          <Text style={styles.controlButtonEmoji}>{isMuted ? '🔇' : '🎤'}</Text>
          <Text style={styles.controlButtonText}>
            {isMuted ? 'Unmute' : 'Mute'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleSpeaker} style={styles.controlButton}>
          <Text style={styles.controlButtonEmoji}>
            {isSpeakerOn ? '🔊' : '🎧'}
          </Text>
          <Text style={styles.controlButtonText}>
            {isSpeakerOn ? 'Speaker' : 'Earpiece'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={toggleVideo} style={styles.controlButton}>
          <Text style={styles.controlButtonEmoji}>
            {isVideoOn ? '📹' : '📷'}
          </Text>
          <Text style={styles.controlButtonText}>
            {isVideoOn ? 'Video Off' : 'Video On'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={switchCamera} style={styles.controlButton}>
          <Text style={styles.controlButtonEmoji}>🔄</Text>
          <Text style={styles.controlButtonText}>Switch</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => endCall()}
          style={styles.endCallButton}
        >
          <Text style={styles.controlButtonEmoji}>📞</Text>
          <Text style={styles.endCallButtonText}>End</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  remoteVideo: {
    flex: 1,
    backgroundColor: '#000',
  },
  remoteVideoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  localVideo: {
    position: 'absolute',
    width: 120,
    height: 160,
    top: 20,
    right: 20,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#fff',
  },
  statusText: {
    color: 'white',
    fontSize: 18,
  },
  durationContainer: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 20,
  },
  durationText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  controlButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  controlButtonEmoji: {
    fontSize: 24,
  },
  controlButtonText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
  },
  endCallButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'red',
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  endCallButtonText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
  },
});

export default VideoCallScreen;