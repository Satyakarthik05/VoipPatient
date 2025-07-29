import React, { useState } from 'react';
import { View, TextInput, Button, Alert, StyleSheet } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { User } from '../types/User';
import { Picker } from '@react-native-picker/picker';
import { API_URL } from '../services/service';

type Props = NativeStackScreenProps<any, 'Register'>;

const RegisterScreen: React.FC<Props> = ({ navigation }) => {
  const [user, setUser] = useState<User>({
    username: '',
    password: '',
    fullName: '',
    role: 'DOCTOR',
  });

  const handleRegister = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });

      if (res.ok) {
        Alert.alert('Success', 'Registered successfully');
        navigation.navigate('Login');
      } else {
        Alert.alert('Error', 'Registration failed');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Something went wrong');
    }
  };

  return (
    <View style={styles.container}>
      <TextInput placeholder="Full Name" onChangeText={(t) => setUser({ ...user, fullName: t })} style={styles.input} />
      <TextInput placeholder="Username" onChangeText={(t) => setUser({ ...user, username: t })} style={styles.input} />
      <TextInput placeholder="Password" secureTextEntry onChangeText={(t) => setUser({ ...user, password: t })} style={styles.input} />
      <Picker
        selectedValue={user.role}
        onValueChange={(val: any) => setUser({ ...user, role: val })}
        style={styles.picker}>
        <Picker.Item label="Doctor" value="DOCTOR" />
        <Picker.Item label="Patient" value="PATIENT" />
      </Picker>
      <Button title="Register" onPress={handleRegister} />
    </View>
  );
};

export default RegisterScreen;

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  input: { borderBottomWidth: 1, marginBottom: 20 },
  picker: { height: 50, marginBottom: 20 },
});
