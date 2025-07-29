import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Button, FlatList, StyleSheet, Alert, Modal } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { API_URL } from '../services/service';
import { WS_URL } from '../services/service';

interface Props {
  route: {
    params: {
      username: string;
      role: 'DOCTOR' | 'PATIENT';
      id: number;
    };
  };
}

const HomeScreen: React.FC<Props> = ({ route }) => {
  const { role, id, username } = route.params;
  const [users, setUsers] = useState<any[]>([]);
  const [incomingCallFrom, setIncomingCallFrom] = useState<string | null>(null);
  const [callerName, setCallerName] = useState<string>('');
  const navigation = useNavigation<any>();
  const wsRef = useRef<WebSocket | null>(null);

  const fetchUsers = async () => {
    const oppositeRole = role === 'DOCTOR' ? 'PATIENT' : 'DOCTOR';
    try {
      const res = await fetch(
        `${API_URL}/api/users/role-view?role=${oppositeRole}` 
      );
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch users');
    }
  };

  const handleCall = async (receiverId: number, receiverName: string) => {
    try {
      await fetch(`${API_URL}/api/calls/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          callerId: id, 
          receiverId,
          callerName: username 
        }),
      });

      navigation.navigate('VideoCallScreen', {
        currentUserId: id.toString(),
        otherUserId: receiverId.toString(),
        isCaller: true,
        otherUserName: receiverName,
        callerRole: role
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
      callerRole: 'DOCTOR' // Only doctors can receive calls in this flow
    });

    setIncomingCallFrom(null); 
  };

  const rejectCall = () => {
    wsRef.current?.send(JSON.stringify({
      type: 'call_rejected',
      from: id.toString(),
      to: incomingCallFrom
    }));
    setIncomingCallFrom(null);
  };

  useEffect(() => {
    fetchUsers();

    const wsUrl = `${WS_URL}/signal`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      const joinMessage = JSON.stringify({ 
        type: 'join', 
        userId: id.toString(),
        role: role
      });
      wsRef.current?.send(joinMessage);
    };

    wsRef.current.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === 'incoming_call') {
          setCallerName(data.callerName || 'Unknown');
          setIncomingCallFrom(data.from);
        } else if (data.type === 'call_rejected') {
          Alert.alert('Call Rejected', 'The doctor rejected your call');
          setIncomingCallFrom(null);
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
      <Text style={styles.heading}>
        {role === 'DOCTOR' ? 'Patients' : 'Doctors'} List
      </Text>

      <FlatList
        data={users}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardText}>{item.fullName}</Text>
            <Text style={styles.cardText}>{item.username}</Text>
            {role === 'PATIENT' && (
              <Button 
                title="Call Now" 
                onPress={() => handleCall(item.id, item.fullName || item.username)} 
              />
            )}
          </View>
        )}
      />

      <Modal visible={!!incomingCallFrom} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modal}>
            <Text style={styles.modalText}>
              Incoming Call from {callerName}
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
  heading: { fontSize: 22, marginBottom: 20, fontWeight: 'bold', textAlign: 'center' },
  card: { 
    padding: 15, 
    backgroundColor: '#6200ee', 
    marginBottom: 10, 
    borderRadius: 8,
    flexDirection: 'column',
    gap: 10
  },
  cardText: { color: 'white', marginBottom: 5 },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modal: { width: '80%', backgroundColor: 'white', borderRadius: 10, padding: 20, alignItems: 'center' },
  modalText: { fontSize: 18, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
});

export default HomeScreen;