import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import VideoCallScreen from './VideoCallScreen';


const CallSetupScreen = () => {
  const [callStarted, setCallStarted] = useState(false);
  const [userId, setUserId] = useState('');
  const [otherUserId, setOtherUserId] = useState('');
  const [isCaller, setIsCaller] = useState(false);


  const startCall = (caller: boolean) => {
    if (!userId || !otherUserId) {
      Alert.alert('Error', 'Please enter both user IDs');
      return;
    }
    setIsCaller(caller);
    setCallStarted(true);
  };

  if (callStarted) {
    return (
      <VideoCallScreen
        route={{
          params: {
            currentUserId: userId,
            otherUserId: otherUserId,
            isCaller: isCaller,
          },
        }}
        navigation={{ navigate: () => {} }}
      />

    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Video Call App</Text>

      <TextInput
        style={styles.input}
        placeholder="Your User ID"
        value={userId}
        onChangeText={setUserId}
      />

      <TextInput
        style={styles.input}
        placeholder="Other User's ID"
        value={otherUserId}
        onChangeText={setOtherUserId}
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={[styles.button, styles.callButton]}
          onPress={() => startCall(true)}
        >
          <Text style={styles.buttonText}>Start Call</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.answerButton]}
          onPress={() => startCall(false)}
        >
          <Text style={styles.buttonText}>Wait for Call</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    height: 50,
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  buttonContainer: {
    marginTop: 20,
  },
  button: {
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginBottom: 10,
  },
  callButton: {
    backgroundColor: '#4CAF50',
  },
  answerButton: {
    backgroundColor: '#2196F3',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default CallSetupScreen;
