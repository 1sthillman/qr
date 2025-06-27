// Supabase bağlantı bilgileri
const SUPABASE_URL = 'https://wihdzkvgttfwsiijxidy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpaGR6a3ZndHRmd3NpaWp4aWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MzA0MjIsImV4cCI6MjA2NjIwNjQyMn0.Cpn6y7ybyLA3uL-bjvsxPKoIw-J7I6eTE5cPGnBjOo4';

// Global değişkenler
let supabase = null;
let tablesChannel = null;
let callsChannel = null;
let restaurantId = null;
let audioPlayer = null;
let connectionRetries = 0;
const MAX_RETRIES = 3;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Garson paneli yükleniyor...');
    
    // Audio player oluştur
    audioPlayer = new Audio('waiter_call_sound.mp3');
    
    // Supabase bağlantısını başlat
    initSupabase();
    
    // Giriş sayfası ve ana panel arasında geçiş
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('logoutButton').addEventListener('click', handleLogout);
    
    // Masa 3 sorununu düzeltme butonu
    document.getElementById('fixTable3Button').addEventListener('click', fixTable3Issue);
    
    // Daha önce giriş yapılmış mı kontrol et
    const savedRestaurantId = localStorage.getItem('restaurantId');
    if (savedRestaurantId) {
        document.getElementById('restaurantIdInput').value = savedRestaurantId;
    }
});

// Supabase bağlantısını başlat
async function initSupabase() {
    try {
        // Supabase kütüphanesinin yüklendiğinden emin ol
        if (typeof window.supabase === 'undefined') {
            console.error('Supabase kütüphanesi yüklenemedi');
            showError('Veritabanı bağlantısı kurulamadı. Sayfayı yenileyin.');
            return false;
        }
        
        // Supabase client oluştur
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase bağlantısı başarılı');
        
        // Bağlantı durumunu dinle
        supabase.realtime.onOpen(() => {
            console.log('Realtime bağlantı açıldı');
            connectionRetries = 0; // Bağlantı başarılı olduğunda sayacı sıfırla
        });
        
        supabase.realtime.onClose(() => {
            console.log('Realtime bağlantı kapandı');
            if (connectionRetries < MAX_RETRIES) {
                connectionRetries++;
                console.log(`Yeniden bağlanmaya çalışılıyor... (${connectionRetries}/${MAX_RETRIES})`);
                setTimeout(() => {
                    if (restaurantId) {
                        listenForTableChanges();
                    }
                }, 2000); // 2 saniye sonra tekrar dene
            } else {
                showError('Sunucu bağlantısı kesildi. Lütfen sayfayı yenileyin.');
            }
        });
        
        return true;
    } catch (error) {
        console.error('Supabase başlatma hatası:', error);
        showError('Veritabanı bağlantısı kurulamadı. Sayfayı yenileyin.');
        return false;
    }
}

// Giriş işlemi
async function handleLogin(event) {
    event.preventDefault();
    
    const loginButton = document.getElementById('loginButton');
    const restaurantIdInput = document.getElementById('restaurantIdInput');
    
    // Butonu devre dışı bırak
    loginButton.disabled = true;
    loginButton.innerHTML = '<i class="ri-loader-2-line animate-spin mr-2"></i> Giriş yapılıyor...';
    
    restaurantId = restaurantIdInput.value.trim();
    
    if (!restaurantId) {
        showLoginError('Restoran ID giriniz');
        resetLoginButton(loginButton);
        return;
    }
    
    try {
        // Supabase bağlantısını kontrol et
        if (!supabase) {
            const initResult = await initSupabase();
            if (!initResult) {
                showLoginError('Veritabanı bağlantısı kurulamadı');
                resetLoginButton(loginButton);
                return;
            }
        }
        
        // Restoran var mı kontrol et
        const { data, error } = await supabase
            .from('restaurants')
            .select('id, name')
            .eq('id', restaurantId)
            .single();
            
        if (error) {
            console.error('Restoran sorgusu hatası:', error);
            showLoginError('Restoran bulunamadı');
            resetLoginButton(loginButton);
            return;
        }
        
        if (!data) {
            showLoginError('Restoran bulunamadı');
            resetLoginButton(loginButton);
            return;
        }
        
        console.log('Restoran bulundu:', data);
        
        // Giriş başarılı, bilgileri kaydet
        localStorage.setItem('restaurantId', restaurantId);
        document.getElementById('restaurantName').textContent = data.name || `Restaurant ${restaurantId}`;
        
        // Giriş ekranını gizle, ana paneli göster
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('mainPage').classList.remove('hidden');
        
        // Masa durumlarını dinle
        listenForTableChanges();
        
        // Aktif çağrıları kontrol et
        checkActiveCalls();
        
        // Başlangıçta Masa 3 sorununu kontrol et
        await checkTable3Issue();
        
    } catch (error) {
        console.error('Giriş hatası:', error);
        showLoginError('Giriş yapılamadı');
        resetLoginButton(loginButton);
    }
}

// Çıkış işlemi
function handleLogout() {
    // Kanalları kapat
    if (tablesChannel) {
        tablesChannel.unsubscribe();
    }
    
    if (callsChannel) {
        callsChannel.unsubscribe();
    }
    
    // Lokal bilgileri temizle
    localStorage.removeItem('restaurantId');
    restaurantId = null;
    
    // Ana paneli gizle, giriş ekranını göster
    document.getElementById('mainPage').classList.add('hidden');
    document.getElementById('loginPage').classList.remove('hidden');
    
    // Çağrı listesini temizle
    document.getElementById('callsList').innerHTML = '';
}

// Giriş butonunu sıfırla
function resetLoginButton(button) {
    button.disabled = false;
    button.innerHTML = 'Giriş Yap';
}

// Giriş hatası göster
function showLoginError(message) {
    const errorDiv = document.getElementById('loginError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    
    setTimeout(() => {
        errorDiv.classList.add('hidden');
    }, 5000);
}

// Genel hata göster
function showError(message) {
    const errorToast = document.getElementById('errorToast');
    const errorMessage = document.getElementById('errorMessage');
    
    errorMessage.textContent = message;
    errorToast.classList.remove('hidden');
    
    setTimeout(() => {
        errorToast.classList.add('hidden');
    }, 5000);
}

// Supabase'den masa durumlarını dinle
function listenForTableChanges() {
    if (!supabase) {
        console.error('Supabase bağlantısı yok, dinleme yapılamıyor');
        return;
    }
    
    // Önceki kanalları temizle
    if (tablesChannel) {
        tablesChannel.unsubscribe();
        console.log('Önceki masa kanalı aboneliği iptal edildi');
    }
    
    if (callsChannel) {
        callsChannel.unsubscribe();
        console.log('Önceki çağrı kanalı aboneliği iptal edildi');
    }
    
    console.log('Supabase realtime dinleme başlatılıyor... Restaurant ID:', restaurantId);
    console.log('Supabase URL:', SUPABASE_URL);
    
    try {
        // 1. Masa durumlarını dinle
        tablesChannel = supabase
            .channel(`restaurant-tables-${restaurantId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'tables',
                filter: `restaurant_id=eq.${restaurantId}`
            }, (payload) => {
                console.log('Masa değişikliği algılandı:', payload);
                
                if (payload.eventType === 'UPDATE' && payload.new.status === 'calling') {
                    // Masa çağrı yapıyor, çağrıları kontrol et
                    checkActiveCalls();
                }
            })
            .subscribe(status => {
                console.log(`Masa kanalı durumu (Restaurant: ${restaurantId}):`, status);
            });
            
        // 2. Çağrıları dinle
        callsChannel = supabase
            .channel(`restaurant-calls-${restaurantId}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'calls'
            }, (payload) => {
                console.log('Yeni çağrı algılandı:', payload);
                // Yeni çağrı geldiğinde aktif çağrıları kontrol et
                checkActiveCalls();
            })
            .subscribe(status => {
                console.log(`Çağrı kanalı durumu (Restaurant: ${restaurantId}):`, status);
            });
            
    } catch (error) {
        console.error('Dinleme hatası:', error);
        showError('Masa durumları dinlenemiyor. Lütfen sayfayı yenileyin.');
    }
}

// Aktif çağrıları kontrol et
async function checkActiveCalls() {
    if (!supabase || !restaurantId) {
        console.error('Aktif çağrı kontrolü için Supabase veya Restaurant ID eksik');
        return;
    }
    
    try {
        console.log('Aktif çağrılar kontrol ediliyor...');
        
        // 1. Önce tüm masaları 'calling' durumunda olanları al
        const { data: callingTables, error: tablesError } = await supabase
            .from('tables')
            .select('id, number, status')
            .eq('restaurant_id', restaurantId)
            .eq('status', 'calling');
            
        if (tablesError) {
            console.error('Çağrı yapan masalar alınamadı:', tablesError);
            return;
        }
        
        if (!callingTables || callingTables.length === 0) {
            console.log('Çağrı yapan masa yok');
            return;
        }
        
        console.log('Çağrı yapan masalar:', callingTables);
        
        // 2. Her masa için son çağrıyı kontrol et
        for (const table of callingTables) {
            const { data: calls, error: callsError } = await supabase
                .from('calls')
                .select('id, created_at, status')
                .eq('table_id', table.id)
                .eq('status', 'requested')
                .order('created_at', { ascending: false })
                .limit(1);
                
            if (callsError) {
                console.error(`Masa ${table.number} için çağrılar alınamadı:`, callsError);
                continue;
            }
            
            if (!calls || calls.length === 0) {
                console.log(`Masa ${table.number} için aktif çağrı yok, durumu düzeltiliyor`);
                
                // Masa çağrı yapıyor ama çağrı yok, durumu düzelt
                await supabase
                    .from('tables')
                    .update({ status: 'idle' })
                    .eq('id', table.id);
                    
                continue;
            }
            
            const call = calls[0];
            
            // 30 dakikadan eski çağrıları otomatik temizle
            const callTime = new Date(call.created_at);
            const now = new Date();
            const timeDiff = (now - callTime) / (1000 * 60); // dakika cinsinden fark
            
            if (timeDiff > 30) {
                console.log(`Masa ${table.number} için çağrı çok eski (${timeDiff.toFixed(1)} dakika), temizleniyor`);
                
                // Çağrıyı kapat
                await supabase
                    .from('calls')
                    .update({ status: 'completed' })
                    .eq('id', call.id);
                    
                // Masa durumunu güncelle
                await supabase
                    .from('tables')
                    .update({ status: 'idle' })
                    .eq('id', table.id);
                    
                continue;
            }
            
            // Çağrıyı ekle
            addCallToList(table.number, call.id);
        }
        
    } catch (error) {
        console.error('Aktif çağrı kontrolü hatası:', error);
    }
}

// Çağrı listesine yeni çağrı ekle
function addCallToList(tableNumber, callId) {
    const callsList = document.getElementById('callsList');
    
    // Aynı masa için zaten çağrı var mı kontrol et
    const existingCall = document.querySelector(`[data-table="${tableNumber}"]`);
    if (existingCall) {
        console.log(`Masa ${tableNumber} için zaten çağrı var, güncelleniyor`);
        return;
    }
    
    console.log(`Masa ${tableNumber} için yeni çağrı ekleniyor`);
    
    // Ses çal
    if (audioPlayer) {
        audioPlayer.play().catch(e => console.error('Ses çalma hatası:', e));
    }
    
    // Yeni çağrı elementi oluştur
    const callItem = document.createElement('div');
    callItem.className = 'bg-glass-bg border border-glass-border backdrop-blur-glass rounded-xl p-4 mb-4 animate-pulse';
    callItem.dataset.table = tableNumber;
    callItem.dataset.callId = callId;
    
    callItem.innerHTML = `
        <div class="flex items-center justify-between">
            <div>
                <h3 class="text-lg font-semibold">Masa ${tableNumber}</h3>
                <p class="text-gray-400 text-sm">Garson çağırıyor</p>
            </div>
            <button class="acknowledge-button bg-primary hover:bg-primary/80 text-white py-2 px-4 rounded-lg transition-all">
                <i class="ri-check-line mr-1"></i> Onayla
            </button>
        </div>
    `;
    
    // Onaylama butonuna tıklama olayı ekle
    callItem.querySelector('.acknowledge-button').addEventListener('click', () => {
        acknowledgeCall(callId, tableNumber, callItem);
    });
    
    // Listeye ekle
    callsList.prepend(callItem);
    
    // 3 saniye sonra titreşimi durdur
    setTimeout(() => {
        callItem.classList.remove('animate-pulse');
    }, 3000);
}

// Çağrıyı onayla
async function acknowledgeCall(callId, tableNumber, callItem) {
    try {
        console.log(`Masa ${tableNumber} çağrısı onaylanıyor...`);
        
        // Çağrı durumunu güncelle
        const { error: callError } = await supabase
            .from('calls')
            .update({ status: 'acknowledged' })
            .eq('id', callId);
            
        if (callError) {
            console.error('Çağrı onaylama hatası:', callError);
            showError('Çağrı onaylanamadı');
            return;
        }
        
        // Masa durumunu güncelle
        const { error: tableError } = await supabase
            .from('tables')
            .update({ status: 'serving' })
            .eq('restaurant_id', restaurantId)
            .eq('number', parseInt(tableNumber, 10));
            
        if (tableError) {
            console.error('Masa durumu güncelleme hatası:', tableError);
            showError('Masa durumu güncellenemedi');
            return;
        }
        
        console.log(`Masa ${tableNumber} çağrısı onaylandı`);
        
        // Çağrıyı listeden kaldır
        callItem.classList.add('fade-out');
        setTimeout(() => {
            callItem.remove();
        }, 500);
        
    } catch (error) {
        console.error('Çağrı onaylama hatası:', error);
        showError('Çağrı onaylanırken bir hata oluştu');
    }
}

// Masa 3 sorununu kontrol et
async function checkTable3Issue() {
    try {
        console.log('Masa 3 durumu kontrol ediliyor...');
        
        // Masa 3'ü bul
        const { data: table3, error: findError } = await supabase
            .from('tables')
            .select('id, status')
            .eq('restaurant_id', restaurantId)
            .eq('number', 3)
            .single();
            
        if (findError && findError.code !== 'PGRST116') {
            console.log('Masa 3 bulunamadı, sorun yok');
            return;
        }
        
        if (table3 && table3.status === 'calling') {
            // Masa 3'ün aktif çağrılarını kontrol et
            const { data: calls, error: callsError } = await supabase
                .from('calls')
                .select('id')
                .eq('table_id', table3.id)
                .eq('status', 'requested')
                .order('created_at', { ascending: false });
                
            if (callsError) {
                console.error('Masa 3 çağrıları kontrol edilemedi:', callsError);
                return;
            }
            
            if (!calls || calls.length === 0) {
                console.log('Masa 3 hayalet çağrı tespit edildi, otomatik düzeltiliyor');
                await fixTable3Issue();
            }
        }
    } catch (error) {
        console.error('Masa 3 kontrol hatası:', error);
    }
}

// Masa 3 sorununu düzelt
async function fixTable3Issue() {
    try {
        console.log('Masa 3 sorunu düzeltiliyor...');
        
        // Masa 3'ü bul
        const { data: table3, error: findError } = await supabase
            .from('tables')
            .select('id')
            .eq('restaurant_id', restaurantId)
            .eq('number', 3)
            .single();
            
        if (findError && findError.code !== 'PGRST116') {
            console.error('Masa 3 bulunamadı:', findError);
            showError('Masa 3 bulunamadı');
            return;
        }
        
        if (table3) {
            // Masa 3 varsa durumunu idle yap
            const { error: updateError } = await supabase
                .from('tables')
                .update({ status: 'idle' })
                .eq('id', table3.id);
                
            if (updateError) {
                console.error('Masa 3 güncellenemedi:', updateError);
                showError('Masa 3 güncellenemedi');
                return;
            }
            
            // Masa 3'ün aktif çağrılarını kapat
            const { error: callsError } = await supabase
                .from('calls')
                .update({ status: 'completed' })
                .eq('table_id', table3.id)
                .eq('status', 'requested');
                
            if (callsError) {
                console.error('Masa 3 çağrıları güncellenemedi:', callsError);
                showError('Masa 3 çağrıları güncellenemedi');
                return;
            }
            
            console.log('Masa 3 sorunu düzeltildi');
            showSuccess('Masa 3 sorunu düzeltildi');
            
            // Çağrı listesinden Masa 3'ü kaldır
            const masa3Element = document.querySelector('[data-table="3"]');
            if (masa3Element) {
                masa3Element.remove();
            }
        } else {
            showError('Masa 3 bulunamadı');
        }
    } catch (error) {
        console.error('Masa 3 düzeltme hatası:', error);
        showError('Masa 3 düzeltilirken bir hata oluştu');
    }
}

// Başarı mesajı göster
function showSuccess(message) {
    const successToast = document.getElementById('successToast');
    const successMessage = document.getElementById('successMessage');
    
    successMessage.textContent = message;
    successToast.classList.remove('hidden');
    
    setTimeout(() => {
        successToast.classList.add('hidden');
    }, 5000);
} 