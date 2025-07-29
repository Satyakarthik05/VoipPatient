import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Button, FlatList, StyleSheet, Alert, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';

interface Props {
  route: {
    params: {
      username: string;
      role: 'PATIENT';
      id: number;
      medicalHistory?: string;
    };
  };
}

const PatientHomeScreen: React.FC<Props> = ({ route }) => {
  const { id, medicalHistory } = route.params;
  const [doctors, setDoctors] = useState<any[]>([]);
  const [incomingCallFrom, setIncomingCallFrom] = useState<string | null>(null);
  const [callerName, setCallerName] = useState<string>('');
  const navigation = useNavigation<any>();
  const wsRef = useRef<WebSocket | null>(null);

  const fetchDoctors = async () => {
    try {
      const res = await fetch(
        `http://192.168.29.219:8080/api/users/role-view?role=DOCTOR`
      );
      const data = await res.json();
      setDoctors(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch doctors');
    }
  };

  const handleCall = async (doctorId: number, doctorName: string) => {
    try {
      await fetch(`http://192.168.29.219:8080/api/calls/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          callerId: id, 
          receiverId: doctorId,
          callerName: route.params.username,
          callerRole: 'PATIENT'
        }),
      });

      navigation.navigate('VideoCallScreen', {
        currentUserId: id.toString(),
        otherUserId: doctorId.toString(),
        isCaller: true,
        otherUserName: doctorName,
        userRole: 'PATIENT'
      });
    } catch (error) {
      Alert.alert('Error', 'Could not initiate call');
    }
  };

  const acceptCall = () => {
    if (!incomingCallFrom) return;

    navigation.navigate('VideoCallScreen', {
      currentUserId: id.toString(),
      otherUserId: incomingCallFrom,
      isCaller: false,
      otherUserName: callerName,
      userRole: 'PATIENT'
    });

    setIncomingCallFrom(null);
  };

  const rejectCall = () => {
    wsRef.current?.send(JSON.stringify({
      type: 'call_rejected',
      from: id.toString(),
      to: incomingCallFrom,
      role: 'PATIENT'
    }));
    setIncomingCallFrom(null);
  };

  useEffect(() => {
    fetchDoctors();

    const wsUrl = 'ws://192.168.29.219:8080/signal';
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      const joinMessage = JSON.stringify({ 
        type: 'join', 
        userId: id.toString(),
        role: 'PATIENT'
      });
      wsRef.current?.send(joinMessage);
    };

    wsRef.current.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'incoming_call' && data.callerRole === 'DOCTOR') {
          setCallerName(data.callerName || 'Doctor');
          setIncomingCallFrom(data.from);
        }
      } catch (e) {
        console.error('Message parse error:', e);
      }
    };

    return () => {
      wsRef.current?.close();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Available Doctors</Text>
      {medicalHistory && (
        <Text style={styles.medicalHistory}>My Medical History: {medicalHistory}</Text>
      )}

      <FlatList
        data={doctors}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardText}>Dr. {item.fullName}</Text>
            <Text style={styles.cardText}>Specialization: {item.specialization}</Text>
            <Button 
              title="Request Consultation" 
              onPress={() => handleCall(item.id, item.fullName)} 
            />
          </View>
        )}
      />

      <Modal visible={!!incomingCallFrom} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modal}>
            <Text style={styles.modalText}>
              Dr. {callerName} is calling...
            </Text>
            <View style={styles.modalButtons}>
              <Button title="Accept" onPress={acceptCall} />
              <Button title="Reject" onPress={rejectCall} color="red" />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#f5f5f5' },
  heading: { fontSize: 22, marginBottom: 10, fontWeight: 'bold', textAlign: 'center' },
  medicalHistory: { fontSize: 14, marginBottom: 20, fontStyle: 'italic', color: '#555' },
  card: { padding: 15, backgroundColor: '#4caf50', marginBottom: 10, borderRadius: 8 },
  cardText: { color: 'white', marginBottom: 5 },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 20, alignItems: 'center' },
  modalText: { fontSize: 18, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
});

export default PatientHomeScreen;