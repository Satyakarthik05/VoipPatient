import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, Alert, Modal, TouchableOpacity
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { API_URL, WS_URL } from '../services/service';
import Icon from 'react-native-vector-icons/Feather';

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
      const res = await fetch(`${API_URL}/api/users/role-view?role=${oppositeRole}`);
      const data = await res.json();
      setUsers(data);
    } catch {
      Alert.alert('Error', 'Failed to fetch users');
    }
  };

  const handleCall = async (receiverId: number, receiverName: string) => {
    try {
      await fetch(`${API_URL}/api/calls/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callerId: id, receiverId, callerName: username }),
      });

      navigation.navigate('VideoCallScreen', {
        currentUserId: id.toString(),
        otherUserId: receiverId.toString(),
        isCaller: true,
        otherUserName: receiverName,
        callerRole: role,
      });
    } catch {
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
      callerRole: 'DOCTOR',
    });
    setIncomingCallFrom(null);
  };

  const rejectCall = () => {
    wsRef.current?.send(JSON.stringify({
      type: 'call_rejected',
      from: id.toString(),
      to: incomingCallFrom,
    }));
    setIncomingCallFrom(null);
  };

  useEffect(() => {
    fetchUsers();

    const wsUrl = `${WS_URL}/signal`;
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      wsRef.current?.send(JSON.stringify({
        type: 'join',
        userId: id.toString(),
        role,
      }));
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
        console.error('WebSocket message error:', e);
      }
    };

    return () => {
      wsRef.current?.close();
    };
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Doctors Available</Text>
        <TouchableOpacity style={styles.logoutButton} onPress={() => navigation.goBack()}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Patient/Doctor List */}
      <FlatList
        data={users}
        keyExtractor={(item) => item.id?.toString() || Math.random().toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.name}>{item.fullName}</Text>
              <Text style={styles.id}>#{item.id}</Text>
            </View>
            <Text style={styles.age}>25 years</Text>

            <View style={styles.cardFooter}>
              <View style={styles.statusContainer}>
                <View style={styles.greenDot} />
                <Text style={styles.statusText}>Active</Text>
              </View>
              <View style={styles.timeContainer}>
                <Icon name="clock" size={16} color="#007AFF" />
                <Text style={styles.timeText}>5:00 PM</Text>
              </View>
            </View>

            {role === 'PATIENT' && (
              <TouchableOpacity
                onPress={() => handleCall(item.id, item.fullName || item.username)}
                style={styles.callButton}
              >
                <Text style={styles.callButtonText}>Call Now</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      {/* Incoming Call Modal */}
      <Modal visible={!!incomingCallFrom} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modal}>
            <Text style={styles.modalText}>Incoming Call from {callerName}</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.acceptBtn} onPress={acceptCall}>
                <Text style={styles.acceptText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rejectBtn} onPress={rejectCall}>
                <Text style={styles.rejectText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAFA' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  headerTitle: { fontSize: 20, fontWeight: 'bold',color: '#333' },
  logoutButton: {
    borderWidth: 1,
    borderColor: '#6200EE',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  logoutText: { color: '#6200EE', fontWeight: '600' },
  card: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 10,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  name: { fontSize: 16, fontWeight: '600' ,color: '#333'},
  id: { color: '#888' },
  age: { color: '#666', fontSize: 13, marginTop: 4 },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  statusContainer: { flexDirection: 'row', alignItems: 'center' },
  greenDot: {
    width: 8,
    height: 8,
    backgroundColor: 'green',
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: { color: '#333' },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: '#007AFF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  timeText: { color: '#007AFF', marginLeft: 4 },
  callButton: {
    marginTop: 10,
    backgroundColor: '#007AFF',
    paddingVertical: 8,
    borderRadius: 8,
  },
  callButtonText: {
    textAlign: 'center',
    color: 'white',
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  modal: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  modalText: { fontSize: 18, marginBottom: 20 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-around', width: '100%' },
  acceptBtn: {
    backgroundColor: '#28a745',
    padding: 10,
    borderRadius: 8,
    marginRight: 10,
  },
  rejectBtn: {
    backgroundColor: '#dc3545',
    padding: 10,
    borderRadius: 8,
  },
  acceptText: { color: 'white', fontWeight: '600' },
  rejectText: { color: 'white', fontWeight: '600' },
});

export default HomeScreen;
