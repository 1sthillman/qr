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

// DOM elementleri
const loginPage = document.getElementById('login-page');
const dashboardPage = document.getElementById('dashboard-page');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const restaurantIdInput = document.getElementById('restaurant-id');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');
const restaurantNameDisplay = document.getElementById('restaurant-name');
const callsContainer = document.getElementById('calls-container');
const emptyState = document.getElementById('empty-state');
const notificationElement = document.getElementById('notification');
const notificationSound = document.getElementById('notification-sound');

// Filtre butonları
const filterBtns = document.querySelectorAll('.filter-btn');

// Durum değişkenleri
let currentRestaurantId = null;
let currentRestaurantName = '';
let activeFilter = 'all';
let subscription = null;

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

// Supabase bağlantısı
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Olay dinleyicileri
function setupEventListeners() {
    // Giriş butonu
    loginBtn.addEventListener('click', handleLogin);

    // Çıkış butonu
    logoutBtn.addEventListener('click', handleLogout);

    // Enter tuşu ile giriş
    passwordInput.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            handleLogin();
        }
    });

    // Filtre butonları
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            activeFilter = btn.getAttribute('data-filter');
            
            // Active class'ı güncelle
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Çağrıları filtrele
            loadCalls();
        });
    });
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

// Çağrıları yükle
async function loadCalls() {
    try {
        // Restoran ID'sine göre tüm masaları al
        const { data: tables, error: tablesError } = await supabase
            .from('tables')
            .select('id, number')
            .eq('restaurant_id', currentRestaurantId);
            
        if (tablesError) {
            console.error('Masa verileri alınamadı:', tablesError);
            return;
        }
        
        // Masa ID'lerini al
        const tableIds = tables.map(table => table.id);
        
        // Masa ID'lerine göre çağrıları al
        let query = supabase
            .from('calls')
            .select('id, status, created_at, acknowledged_at, table_id');
            
        // Filtreleme
        if (activeFilter === 'requested') {
            query = query.eq('status', 'requested');
        } else if (activeFilter === 'acknowledged') {
            query = query.eq('status', 'acknowledged');
        }
        
        query = query.in('table_id', tableIds)
            .order('created_at', { ascending: false });
            
        const { data: calls, error: callsError } = await query;
        
        if (callsError) {
            console.error('Çağrı verileri alınamadı:', callsError);
            return;
        }
        
        // Çağrıları görüntüle
        displayCalls(calls, tables);
        
    } catch (error) {
        console.error('Veri yükleme hatası:', error);
    }
}

// Çağrıları görüntüleme
function displayCalls(calls, tables) {
    // Önce container'ı temizle
    callsContainer.innerHTML = '';
    
    // Çağrı yoksa boş durum göster
    if (!calls || calls.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    // Her çağrı için kart oluştur
    calls.forEach(call => {
        // Masa bilgisini bul
        const table = tables.find(t => t.id === call.table_id);
        if (!table) return;
        
        // Zaman formatla
        const callTime = new Date(call.created_at);
        const formattedTime = callTime.toLocaleTimeString('tr-TR', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Kart elementi
        const callCard = document.createElement('div');
        callCard.className = `call-card ${call.status === 'acknowledged' ? 'acknowledged' : ''}`;
        callCard.setAttribute('data-call-id', call.id);
        
        // Kart içeriği
        callCard.innerHTML = `
            <div class="call-header">
                <span class="table-number">Masa ${table.number}</span>
                <span class="call-time">${formattedTime}</span>
            </div>
            <div class="call-status">
                ${call.status === 'requested' 
                    ? '<p>Garson çağrısı bekliyor</p>' 
                    : '<p>Garson yanıt verdi</p>'}
            </div>
            <div class="call-actions">
                ${call.status === 'requested' 
                    ? `<button class="call-btn acknowledge-btn" data-call-id="${call.id}">Geliyorum</button>` 
                    : `<button class="call-btn complete-btn" data-call-id="${call.id}">Tamamlandı</button>`}
                <button class="call-btn cancel-btn" data-call-id="${call.id}">İptal</button>
            </div>
        `;
        
        // Event listeners ekle
        callCard.querySelector('.acknowledge-btn')?.addEventListener('click', (e) => {
            acknowledgeCall(e.target.getAttribute('data-call-id'));
        });
        
        callCard.querySelector('.complete-btn')?.addEventListener('click', (e) => {
            completeCall(e.target.getAttribute('data-call-id'));
        });
        
        callCard.querySelector('.cancel-btn').addEventListener('click', (e) => {
            cancelCall(e.target.getAttribute('data-call-id'));
        });
        
        // Kart'ı container'a ekle
        callsContainer.appendChild(callCard);
    });
}

// Çağrıyı tamamla
async function completeCall(callId) {
    try {
        // Çağrıyı çıkart veya arşivle
        const { error } = await supabase
            .from('calls')
            .update({
                status: 'done'
            })
            .eq('id', callId);
            
        if (error) {
            console.error('Çağrı tamamlama hatası:', error);
            return;
        }
        
        // UI güncelle
        const callCard = document.querySelector(`.call-card[data-call-id="${callId}"]`);
        if (callCard) {
            callCard.remove();
        }
        
        // Boş durum kontrolü
        if (callsContainer.children.length === 0) {
            emptyState.classList.remove('hidden');
        }
        
    } catch (error) {
        console.error('Çağrı tamamlama işlemi hatası:', error);
    }
}

// Çağrıyı iptal et
async function cancelCall(callId) {
    try {
        // Çağrıyı sil veya durumunu değiştir
        const { error } = await supabase
            .from('calls')
            .delete()
            .eq('id', callId);
            
        if (error) {
            console.error('Çağrı iptal hatası:', error);
            return;
        }
        
        // UI güncelle
        const callCard = document.querySelector(`.call-card[data-call-id="${callId}"]`);
        if (callCard) {
            callCard.remove();
        }
        
        // Boş durum kontrolü
        if (callsContainer.children.length === 0) {
            emptyState.classList.remove('hidden');
        }
        
    } catch (error) {
        console.error('Çağrı iptal işlemi hatası:', error);
    }
}

// Realtime bağlantı kurma
function setupRealtimeConnection() {
    // Önceki aboneliği temizle
    if (subscription) {
        subscription.unsubscribe();
    }
    
    // Tüm restoran çağrılarını dinle
    subscription = supabase
        .channel('public:calls')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'calls'
        }, handleRealtimeEvent)
        .subscribe();
}

// Realtime olaylarını işle
async function handleRealtimeEvent(payload) {
    console.log('Realtime olay:', payload);
    
    // Verileri yenile
    await loadCalls();
    
    // Yeni çağrı geldiğinde bildirim göster
    if (payload.eventType === 'INSERT' && payload.new.status === 'requested') {
        showNotification();
    }
}

// Bildirim göster
function showNotification() {
    // Ses çal
    notificationSound.play().catch(error => {
        console.error('Ses çalma hatası:', error);
    });
    
    // Bildirim göster
    notificationElement.textContent = 'Yeni bir çağrı geldi!';
    notificationElement.classList.add('show');
    
    // 5 saniye sonra gizle
    setTimeout(() => {
        notificationElement.classList.remove('show');
    }, 5000);
} 