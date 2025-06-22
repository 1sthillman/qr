import React, { useState, useEffect, useRef } from 'react';
import { 
  SafeAreaView, 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator,
  Alert,
  Platform
} from 'react-native';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

// Supabase bağlantı bilgileri
// NOT: Gerçek uygulamada bu bilgiler environment variables ile yönetilmeli
const SUPABASE_URL = 'https://egcklzfiyxxnvyxwoowq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnY2tsemZpeXh4bnZ5eHdvb3dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0NjQxMTcsImV4cCI6MjA2NDA0MDExN30.dfRQv3lYFCaI1T5ydOw4HyoEJ0I1wOSIUcG8ueEbxKQ';

// Bildirim ayarları
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function App() {
  // State tanımları
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [restaurantId, setRestaurantId] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [password, setPassword] = useState('');
  const [calls, setCalls] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sound, setSound] = useState();
  
  // Supabase istemcisi
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  
  // Bildirim dinleyicisi referansı
  const notificationListener = useRef();
  const responseListener = useRef();
  
  // Uygulama başladığında çalışacak fonksiyon
  useEffect(() => {
    // Oturum kontrolü
    checkSession();
    
    // Bildirim izinleri
    registerForPushNotifications();
    
    // Bildirim dinleyicileri
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Bildirim alındı:', notification);
    });
    
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Bildirime tıklandı:', response);
    });
    
    // Temizleme fonksiyonu
    return () => {
      Notifications.removeNotificationSubscription(notificationListener.current);
      Notifications.removeNotificationSubscription(responseListener.current);
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, []);
  
  // Oturum açıldığında çalışacak fonksiyon
  useEffect(() => {
    if (isLoggedIn && restaurantId) {
      loadCalls();
      setupRealtimeListener();
    }
  }, [isLoggedIn, restaurantId]);
  
  // Oturum kontrolü
  const checkSession = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      if (session) {
        // Kullanıcı bilgilerini al
        const { data: userData, error: userError } = await supabase.auth.getUser();
        
        if (userError) throw userError;
        
        // Restoran ID'sini email'den çıkar (email: restaurant_id@restaurant.com)
        const email = userData.user.email;
        const extractedRestaurantId = email.split('@')[0];
        
        // Restoran bilgilerini al
        const { data: restaurantData, error: restaurantError } = await supabase
          .from('restaurants')
          .select('name')
          .eq('id', extractedRestaurantId)
          .single();
          
        if (restaurantError) throw restaurantError;
        
        setRestaurantId(extractedRestaurantId);
        setRestaurantName(restaurantData.name);
        setIsLoggedIn(true);
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Oturum kontrolü hatası:', error);
      setIsLoading(false);
    }
  };
  
  // Bildirim izinleri
  const registerForPushNotifications = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        Alert.alert('Uyarı', 'Bildirim izni olmadan çağrıları gerçek zamanlı alamazsınız!');
        return;
      }
    } catch (error) {
      console.error('Bildirim izni hatası:', error);
    }
  };
  
  // Realtime dinleyici kurulumu
  const setupRealtimeListener = () => {
    const channel = supabase
      .channel('realtime-calls')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'calls',
        filter: `status=eq.requested`
      }, async (payload) => {
        // Yeni çağrı geldiğinde
        console.log('Yeni çağrı:', payload);
        
        try {
          // Masa bilgisini al
          const { data: tableData, error: tableError } = await supabase
            .from('tables')
            .select('number, restaurant_id')
            .eq('id', payload.new.table_id)
            .single();
            
          if (tableError) throw tableError;
          
          // Sadece bu restorana ait çağrıları işle
          if (tableData.restaurant_id === restaurantId) {
            // Bildirimi göster
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'Yeni Garson Çağrısı!',
                body: `Masa ${tableData.number} garson çağırıyor.`,
                sound: true,
              },
              trigger: null,
            });
            
            // Ses çal
            playSound();
            
            // Çağrıları yenile
            loadCalls();
          }
        } catch (error) {
          console.error('Çağrı bildirim hatası:', error);
        }
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  };
  
  // Ses çalma fonksiyonu
  const playSound = async () => {
    try {
      const { sound: newSound } = await Audio.Sound.createAsync(
        require('./assets/notification.mp3')
      );
      setSound(newSound);
      await newSound.playAsync();
    } catch (error) {
      console.error('Ses çalma hatası:', error);
    }
  };
  
  // Çağrıları yükleme
  const loadCalls = async () => {
    try {
      setRefreshing(true);
      
      // Çağrıları al
      const { data, error } = await supabase
        .from('calls')
        .select(`
          id,
          status,
          created_at,
          table_id,
          tables:table_id (
            number,
            restaurant_id
          )
        `)
        .eq('status', 'requested')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      // Sadece bu restorana ait çağrıları filtrele
      const filteredCalls = data.filter(call => call.tables.restaurant_id === restaurantId);
      
      setCalls(filteredCalls);
    } catch (error) {
      console.error('Çağrı yükleme hatası:', error);
      Alert.alert('Hata', 'Çağrılar yüklenirken bir hata oluştu.');
    } finally {
      setRefreshing(false);
    }
  };
  
  // Çağrıyı yanıtlama
  const acknowledgeCall = async (callId) => {
    try {
      // Çağrı durumunu güncelle
      const { error } = await supabase
        .from('calls')
        .update({
          status: 'acknowledged',
          acknowledged_at: new Date().toISOString()
        })
        .eq('id', callId);
        
      if (error) throw error;
      
      // Çağrıları yenile
      loadCalls();
    } catch (error) {
      console.error('Çağrı yanıtlama hatası:', error);
      Alert.alert('Hata', 'Çağrı yanıtlanırken bir hata oluştu.');
    }
  };
  
  // Oturum açma
  const handleLogin = async () => {
    try {
      if (!restaurantId || !password) {
        Alert.alert('Hata', 'Lütfen tüm alanları doldurun.');
        return;
      }
      
      setIsLoading(true);
      
      // Oturum aç
      const { error } = await supabase.auth.signInWithPassword({
        email: `${restaurantId}@restaurant.com`,
        password: password
      });
      
      if (error) throw error;
      
      // Restoran bilgilerini al
      const { data: restaurantData, error: restaurantError } = await supabase
        .from('restaurants')
        .select('name')
        .eq('id', restaurantId)
        .single();
        
      if (restaurantError) throw restaurantError;
      
      setRestaurantName(restaurantData.name);
      setIsLoggedIn(true);
      
      // Restoran ID'sini ayarla
      await supabase.rpc('set_current_restaurant', {
        restaurant_id: restaurantId
      });
    } catch (error) {
      console.error('Oturum açma hatası:', error);
      Alert.alert('Hata', 'Oturum açılamadı. Lütfen bilgilerinizi kontrol edin.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Oturumu kapat
  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      setIsLoggedIn(false);
      setRestaurantId('');
      setRestaurantName('');
      setPassword('');
      setCalls([]);
    } catch (error) {
      console.error('Oturum kapatma hatası:', error);
    }
  };
  
  // Yükleniyor ekranı
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </SafeAreaView>
    );
  }
  
  // Oturum açma ekranı
  if (!isLoggedIn) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.loginContainer}>
          <View style={styles.logoContainer}>
            <Ionicons name="restaurant-outline" size={64} color="#FF6B35" />
            <Text style={styles.logoText}>Garson Çağrı</Text>
            <Text style={styles.logoSubText}>Garson Uygulaması</Text>
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Restoran ID</Text>
            <TextInput
              style={styles.input}
              placeholder="Restoran ID (örn: ABC123)"
              value={restaurantId}
              onChangeText={setRestaurantId}
              autoCapitalize="none"
            />
          </View>
          
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Şifre</Text>
            <TextInput
              style={styles.input}
              placeholder="Şifreniz"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>
          
          <TouchableOpacity 
            style={styles.loginButton}
            onPress={handleLogin}
          >
            <Text style={styles.loginButtonText}>Giriş Yap</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  
  // Ana ekran
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.header}>
        <View>
          <Text style={styles.restaurantName}>{restaurantName}</Text>
          <Text style={styles.restaurantId}>ID: {restaurantId}</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Çıkış</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.titleContainer}>
        <Text style={styles.title}>Aktif Çağrılar</Text>
        <TouchableOpacity 
          style={styles.refreshButton}
          onPress={loadCalls}
        >
          <Ionicons name="refresh" size={24} color="#FF6B35" />
        </TouchableOpacity>
      </View>
      
      <FlatList
        data={calls}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.callCard}>
            <View style={styles.callInfo}>
              <Text style={styles.tableNumber}>Masa {item.tables.number}</Text>
              <Text style={styles.callTime}>
                {new Date(item.created_at).toLocaleTimeString('tr-TR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
            </View>
            
            <TouchableOpacity 
              style={styles.acknowledgeButton}
              onPress={() => acknowledgeCall(item.id)}
            >
              <Text style={styles.acknowledgeButtonText}>Geliyorum</Text>
            </TouchableOpacity>
          </View>
        )}
        refreshing={refreshing}
        onRefresh={loadCalls}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-circle-outline" size={64} color="#4CAF50" />
            <Text style={styles.emptyText}>Aktif çağrı bulunmuyor</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

// TextInput bileşeni
const TextInput = ({ style, ...props }) => {
  return (
    <View style={[styles.textInputContainer, style]}>
      <View style={styles.textInputInner}>
        {props.secureTextEntry ? (
          <Ionicons name="lock-closed-outline" size={20} color="#666" style={styles.inputIcon} />
        ) : (
          <Ionicons name="business-outline" size={20} color="#666" style={styles.inputIcon} />
        )}
        <View style={{ flex: 1 }}>
          <View style={styles.textInputWrapper}>
            <input
              {...props}
              style={{
                outline: 'none',
                border: 'none',
                fontSize: 16,
                width: '100%',
                backgroundColor: 'transparent',
                color: '#333',
              }}
            />
          </View>
        </View>
      </View>
    </View>
  );
};

// Stiller
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  loginContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  logoSubText: {
    fontSize: 16,
    color: '#666',
    marginTop: 4,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  textInputContainer: {
    height: 56,
    borderRadius: 8,
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  textInputInner: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: 16,
  },
  inputIcon: {
    marginRight: 12,
  },
  textInputWrapper: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
  },
  loginButton: {
    height: 56,
    backgroundColor: '#FF6B35',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  loginButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  restaurantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  restaurantId: {
    fontSize: 14,
    color: '#666',
  },
  logoutButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  logoutButtonText: {
    color: '#FF6B35',
    fontWeight: '500',
  },
  titleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  refreshButton: {
    padding: 8,
  },
  callCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  callInfo: {
    flex: 1,
  },
  tableNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  callTime: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  acknowledgeButton: {
    backgroundColor: '#FF6B35',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  acknowledgeButtonText: {
    color: '#FFF',
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginTop: 12,
  },
}); 