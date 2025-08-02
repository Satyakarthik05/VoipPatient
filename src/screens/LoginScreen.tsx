import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { API_URL } from '../services/service';

type Props = NativeStackScreenProps<any, 'PatientLogin'>;

const LoginScreen: React.FC<Props> = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role: 'patient' }),
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
    <SafeAreaView style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Patient Login</Text>

        <View style={styles.inputContainer}>
          <Icon name="user" size={18} color="#aaa" style={styles.icon} />
          <TextInput
            placeholder="Username"
            value={username}
            onChangeText={setUsername}
            style={styles.input}
            placeholderTextColor="#aaa"
          />
        </View>

        <View style={styles.inputContainer}>
          <Icon name="lock" size={18} color="#aaa" style={styles.icon} />
          <TextInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            style={styles.input}
            placeholderTextColor="#aaa"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
            <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color="#aaa" />
          </TouchableOpacity>
        </View>

        <View style={styles.optionsRow}>
          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center' }}
            onPress={() => setRememberMe(!rememberMe)}
          >
            <Text style={styles.rememberText}>Remember me</Text>
          </TouchableOpacity>
          <TouchableOpacity>
            <Text style={styles.forgotPassword}>Forget password?</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.loginButton} onPress={handleLogin}>
          <Text style={styles.loginButtonText}>Sign In</Text>
        </TouchableOpacity>

        <Text
          onPress={() => navigation.navigate('Register')}
          style={styles.link}
        >
          Register as a patient
        </Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  inputContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 16,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  rememberText: {
    marginLeft: 5,
    fontSize: 14,
    color: '#444',
  },
  forgotPassword: {
    color: '#4a68ff',
    fontSize: 14,
  },
  loginButton: {
    backgroundColor: '#007BFF',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  link: {
    marginTop: 20,
    textAlign: 'center',
    color: 'blue',
    textDecorationLine: 'underline',
    fontSize: 14,
  },
});

export default LoginScreen;
