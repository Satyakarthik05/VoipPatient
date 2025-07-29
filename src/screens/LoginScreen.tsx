import React, { useState } from 'react';
import {
  View,
  TextInput,
  Button,
  Text,
  StyleSheet,
  Alert,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { API_URL } from '../services/service';

type Props = NativeStackScreenProps<any, 'PatientLogin'>;

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username, 
          password,
          role: 'patient' // Explicitly specifying the role
        }),
      });

      if (res.ok) {
        const userDetails = await res.json();
        if (userDetails.role !== 'PATIENT') {
          Alert.alert('Access Denied', 'This login is for patients only.');
          return;
        }
        
        Alert.alert('Login Success', `Welcome ${userDetails.fullName}`);
        navigation.navigate('Home', {
          username,
          role: userDetails.role,
          id: userDetails.id,
        });
      } else {
        Alert.alert('Login Failed', 'Invalid credentials or not a patient account.');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Something went wrong during login.');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Patient Login</Text>
      <TextInput
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        style={styles.input}
      />
      <TextInput
        placeholder="Password"
        value={password}
        secureTextEntry
        onChangeText={setPassword}
        style={styles.input}
      />
      <Button title="Login as Patient" onPress={handleLogin} />

      <Text onPress={() => navigation.navigate('DoctorLogin')} style={styles.link}>
        Are you a doctor? Login here
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center' },
  input: { 
    borderBottomWidth: 1, 
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 5
  },
  link: { 
    marginTop: 20, 
    color: 'blue', 
    textAlign: 'center',
    textDecorationLine: 'underline'
  },
});

export default LoginScreen;