// Supabase bağlantı bilgileri
const SUPABASE_URL = 'https://wihdzkvgttfwsiijxidy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpaGR6a3ZndHRmd3NpaWp4aWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MzA0MjIsImV4cCI6MjA2NjIwNjQyMn0.Cpn6y7ybyLA3uL-bjvsxPKoIw-J7I6eTE5cPGnBjOo4';

// Global değişkenler
let supabase = null;
let supabaseChannel = null;
let callsChannel = null;
let restaurantId = null;
let audioPlayer = null;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async function() {
    console.log('Garson paneli yükleniyor...');
    
    // Audio player oluştur
    audioPlayer = new Audio('audio/panic.mp3');
    
    // Supabase bağlantısını başlat
    initSupabase();
    
    // Giriş sayfası ve dashboard sayfası elementlerini al
    const loginPage = document.getElementById('loginPage');
    const dashboardPage = document.getElementById('dashboardPage');
    
    // Giriş butonuna tıklama olayı ekle
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.addEventListener('click', function() {
            const restaurantIdInput = document.getElementById('restaurantIdInput');
            if (restaurantIdInput && restaurantIdInput.value.trim()) {
                setRestaurantId(restaurantIdInput.value.trim());
                loginPage.classList.add('hidden');
                dashboardPage.classList.remove('hidden');
            } else {
                showError('Lütfen geçerli bir Restaurant ID girin.');
            }
        });
    }
    
    // Çıkış butonuna tıklama olayı ekle
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            restaurantId = null;
            if (supabaseChannel) supabaseChannel.unsubscribe();
            if (callsChannel) callsChannel.unsubscribe();
            loginPage.classList.remove('hidden');
            dashboardPage.classList.add('hidden');
        });
    }
    
    // Ses test butonuna tıklama olayı ekle
    const testSoundBtn = document.getElementById('testSoundBtn');
    if (testSoundBtn) {
        testSoundBtn.addEventListener('click', function() {
            playNotificationSound();
            showSuccess('Ses testi başarılı!');
        });
    }
    
    // Restoran ID URL'den geliyorsa
    const urlParams = new URLSearchParams(window.location.search);
    const urlRestaurantId = urlParams.get('restaurant_id');
    
    if (urlRestaurantId) {
        const restaurantIdInput = document.getElementById('restaurantIdInput');
        if (restaurantIdInput) {
            restaurantIdInput.value = urlRestaurantId;
            setRestaurantId(urlRestaurantId);
            loginPage.classList.add('hidden');
            dashboardPage.classList.remove('hidden');
        }
    }
});

// Supabase bağlantısını başlat
function initSupabase() {
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase bağlantısı başarılı');
    } catch (error) {
        console.error('Supabase başlatma hatası:', error);
        showError('Veritabanı bağlantısı kurulamadı. Lütfen sayfayı yenileyin.');
    }
}

// Restoran ID'sini ayarla ve dinlemeye başla
async function setRestaurantId(id) {
    try {
        restaurantId = id;
        console.log('Restaurant ID ayarlandı:', restaurantId);
        
        // Masa durumlarını dinle
        listenForTableChanges();
        
        // Masaları yükle ve göster
        loadTables();
        
        // Aktif çağrıları kontrol et
        checkActiveCalls();
        
    } catch (error) {
        console.error('Restoran ayarlama hatası:', error);
        showError('Restoran bilgileri yüklenirken bir hata oluştu.');
    }
}

// Supabase'den masa durumlarını dinle
function listenForTableChanges() {
    if (!supabase) return;
    
    // Önceki kanalları temizle
    if (supabaseChannel) {
        supabaseChannel.unsubscribe();
        console.log('Önceki masa kanalı aboneliği iptal edildi');
    }
    
    if (callsChannel) {
        callsChannel.unsubscribe();
        console.log('Önceki çağrı kanalı aboneliği iptal edildi');
    }
    
    console.log('Supabase realtime dinleme başlatılıyor... Restaurant ID:', restaurantId);
    console.log('Supabase URL:', SUPABASE_URL);
    
    // 1. Masa durumlarını dinle
    supabaseChannel = supabase
        .channel('table-changes')
        .on('postgres_changes', { 
            event: '*', 
            schema: 'public', 
            table: 'tables',
            filter: `restaurant_id=eq.${restaurantId}`
        }, payload => {
            console.log('Supabase table event alındı:', payload);
            
            if (payload.new && payload.new.status === 'calling') {
                // Yeni çağrı geldi
                const tableNumber = payload.new.table_id || payload.new.number;
                console.log(`Masa ${tableNumber} çağrı yapıyor!`);
                
                // Ses çal
                playNotificationSound();
                
                // Bildirimi göster
                showCallNotification(tableNumber);
                
                // Masaları güncelle
                updateTableStatus(tableNumber, 'calling');
                
                // Modal göster
                showCallModal(tableNumber);
            } else if (payload.new && payload.new.status === 'serving') {
                // Masa servis durumuna geçti
                const tableNumber = payload.new.table_id || payload.new.number;
                updateTableStatus(tableNumber, 'serving');
            } else if (payload.new && payload.new.status === 'idle') {
                // Masa boşta durumuna geçti
                const tableNumber = payload.new.table_id || payload.new.number;
                updateTableStatus(tableNumber, 'idle');
            }
        })
        .subscribe(status => {
            console.log('Masa durumu dinleme durumu:', status);
        });
    
    // 2. Çağrı tablosunu dinle
    callsChannel = supabase
        .channel('calls-changes')
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'calls'
        }, async payload => {
            console.log('Supabase calls event alındı:', payload);
            
            if (payload.new) {
                // Yeni çağrı geldi, masa bilgisini al
                const tableInfo = await getTableInfo(payload.new.table_id);
                
                if (tableInfo && tableInfo.restaurant_id === restaurantId) {
                    console.log(`Masa ${tableInfo.number} çağrı yapıyor!`);
                    
                    // Ses çal
                    playNotificationSound();
                    
                    // Bildirimi göster
                    showCallNotification(tableInfo.number);
                    
                    // Masaları güncelle
                    updateTableStatus(tableInfo.number, 'calling');
                    
                    // Modal göster
                    showCallModal(tableInfo.number);
                }
            }
        })
        .subscribe(status => {
            console.log('Çağrı dinleme durumu:', status);
        });
}

// Masa bilgisini al
async function getTableInfo(tableId) {
    if (!supabase) return null;
    
    try {
        console.log(`Masa bilgisi alınıyor: ${tableId}`);
        
        // UUID formatında ise doğrudan ID ile sorgula
        if (tableId && (typeof tableId === 'string') && 
            tableId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
            const { data, error } = await supabase
                .from('tables')
                .select('restaurant_id, number, table_id')
                .eq('id', tableId)
                .single();
                
            if (error) {
                console.error('Masa bilgisi alınamadı (UUID):', error);
                return null;
            }
            
            console.log('Masa bilgisi bulundu (UUID):', data);
            return data;
        } 
        // Sayısal ID ise table_id ile sorgula
        else if (tableId && !isNaN(parseInt(tableId))) {
            const { data, error } = await supabase
                .from('tables')
                .select('restaurant_id, number, table_id')
                .eq('restaurant_id', restaurantId)
                .eq('table_id', parseInt(tableId))
                .single();
                
            if (error) {
                console.error('Masa bilgisi alınamadı (Sayısal):', error);
                return null;
            }
            
            console.log('Masa bilgisi bulundu (Sayısal):', data);
            return data;
        }
        
        return null;
    } catch (err) {
        console.error('Masa bilgisi alma hatası:', err);
        return null;
    }
}

// Masaları yükle
async function loadTables() {
    if (!supabase || !restaurantId) return;
    
    try {
        console.log('Masalar yükleniyor...');
        
        const { data: tables, error } = await supabase
            .from('tables')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('number', { ascending: true });
            
        if (error) {
            console.error('Masalar yüklenemedi:', error);
            showError('Masalar yüklenemedi. Lütfen sayfayı yenileyin.');
            return;
        }
        
        console.log('Masalar yüklendi:', tables);
        
        // Masaları grid'e ekle
        renderTables(tables);
        
    } catch (error) {
        console.error('Masaları yükleme hatası:', error);
        showError('Masalar yüklenirken bir hata oluştu.');
    }
}

// Masaları grid'e ekle
function renderTables(tables) {
    const tablesGrid = document.getElementById('tablesGrid');
    if (!tablesGrid) return;
    
    // Grid'i temizle
    tablesGrid.innerHTML = '';
    
    // Masa yoksa mesaj göster
    if (!tables || tables.length === 0) {
        tablesGrid.innerHTML = '<div class="col-span-full text-center p-8 text-gray-500">Bu restoran için masa bulunamadı.</div>';
        return;
    }
    
    // Her masa için kart oluştur
    tables.forEach(table => {
        const tableCard = createTableCard(table);
        tablesGrid.appendChild(tableCard);
    });
    
    // Arama ve filtreleme işlevselliği ekle
    setupTableSearch();
}

// Masa kartı oluştur
function createTableCard(table) {
    const tableNumber = table.number || table.table_id;
    const status = table.status || 'idle';
    
    const tableCard = document.createElement('div');
    tableCard.className = `table-card relative bg-glass-bg border backdrop-blur-glass rounded-lg flex flex-col items-center justify-center overflow-hidden transition-all duration-300 data-status-${status}`;
    tableCard.dataset.tableNumber = tableNumber;
    tableCard.dataset.status = status;
    
    // Durum sınıflarını ekle
    if (status === 'calling') {
        tableCard.classList.add('border-red-500', 'animate-pulse');
    } else if (status === 'serving') {
        tableCard.classList.add('border-green-500');
    } else {
        tableCard.classList.add('border-glass-border');
    }
    
    // İçerik
    tableCard.innerHTML = `
        <div class="absolute inset-0 overflow-hidden">
            <div class="absolute -inset-[150%] opacity-10 bg-[radial-gradient(circle_farthest-side,rgba(255,255,255,.07),transparent)]"></div>
        </div>
        <div class="relative z-10 text-center">
            <div class="text-4xl font-bold mb-2">${tableNumber}</div>
            <div class="text-sm text-gray-400">Masa</div>
            ${status === 'calling' ? '<div class="mt-2 text-xs text-red-400 animate-pulse"><i class="ri-alarm-warning-fill mr-1"></i> Çağırıyor</div>' : ''}
            ${status === 'serving' ? '<div class="mt-2 text-xs text-green-400"><i class="ri-user-smile-line mr-1"></i> Servis</div>' : ''}
        </div>
    `;
    
    // Tıklama olayı ekle
    tableCard.addEventListener('click', () => {
        if (status === 'calling') {
            // Çağrı modalını göster
            showCallModal(tableNumber);
        }
    });
    
    return tableCard;
}

// Masa durumunu güncelle
function updateTableStatus(tableNumber, status) {
    const tableCard = document.querySelector(`.table-card[data-table-number="${tableNumber}"]`);
    if (!tableCard) {
        // Kart yoksa masaları yeniden yükle
        loadTables();
        return;
    }
    
    // Durum sınıflarını güncelle
    tableCard.classList.remove('border-red-500', 'border-green-500', 'border-glass-border', 'animate-pulse');
    tableCard.dataset.status = status;
    
    if (status === 'calling') {
        tableCard.classList.add('border-red-500', 'animate-pulse');
        tableCard.querySelector('.text-center').innerHTML = `
            <div class="text-4xl font-bold mb-2">${tableNumber}</div>
            <div class="text-sm text-gray-400">Masa</div>
            <div class="mt-2 text-xs text-red-400 animate-pulse"><i class="ri-alarm-warning-fill mr-1"></i> Çağırıyor</div>
        `;
    } else if (status === 'serving') {
        tableCard.classList.add('border-green-500');
        tableCard.querySelector('.text-center').innerHTML = `
            <div class="text-4xl font-bold mb-2">${tableNumber}</div>
            <div class="text-sm text-gray-400">Masa</div>
            <div class="mt-2 text-xs text-green-400"><i class="ri-user-smile-line mr-1"></i> Servis</div>
        `;
    } else {
        tableCard.classList.add('border-glass-border');
        tableCard.querySelector('.text-center').innerHTML = `
            <div class="text-4xl font-bold mb-2">${tableNumber}</div>
            <div class="text-sm text-gray-400">Masa</div>
        `;
    }
}

// Arama işlevselliği ekle
function setupTableSearch() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase().trim();
        const tableCards = document.querySelectorAll('.table-card');
        
        tableCards.forEach(card => {
            const tableNumber = card.dataset.tableNumber;
            if (tableNumber.toString().includes(searchTerm)) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// Aktif çağrıları kontrol et
async function checkActiveCalls() {
    if (!supabase || !restaurantId) return;
    
    try {
        console.log('Aktif çağrılar kontrol ediliyor...');
        
        // 1. Çağrı yapan masaları al
        const { data: tables, error: tablesError } = await supabase
            .from('tables')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .eq('status', 'calling');
            
        if (tablesError) {
            console.error('Masa listesi alınamadı:', tablesError);
            return;
        }
        
        console.log('Çağrı yapan masalar:', tables);
        
        // Çağrı yapan masa varsa bildirim göster
        if (tables && tables.length > 0) {
            tables.forEach(table => {
                const tableNumber = table.number || table.table_id;
                playNotificationSound();
                showCallNotification(tableNumber);
            });
        }
        
    } catch (error) {
        console.error('Aktif çağrı kontrolü hatası:', error);
    }
}

// Çağrı modalını göster
function showCallModal(tableNumber) {
    const callModal = document.getElementById('callModal');
    const modalTableNo = document.getElementById('modalTableNo');
    const modalAckBtn = document.getElementById('modalAckBtn');
    
    if (!callModal || !modalTableNo || !modalAckBtn) return;
    
    // Modal içeriğini ayarla
    modalTableNo.textContent = tableNumber;
    
    // Modal'ı göster
    callModal.classList.remove('hidden');
    
    // Yanıtla butonuna tıklama olayı ekle
    modalAckBtn.onclick = () => {
        acknowledgeCall(tableNumber);
        callModal.classList.add('hidden');
    };
    
    // Modal dışına tıklama ile kapatma
    callModal.addEventListener('click', function(e) {
        if (e.target === callModal) {
            callModal.classList.add('hidden');
        }
    });
}

// Çağrıyı yanıtla
async function acknowledgeCall(tableNumber) {
    if (!supabase) return;
    
    try {
        console.log(`Masa ${tableNumber} çağrısı yanıtlanıyor...`);
        
        // Önce masa ID'sini bul
        const { data: tableData, error: tableError } = await supabase
            .from('tables')
            .select('id')
            .eq('restaurant_id', restaurantId)
            .eq('number', parseInt(tableNumber))
            .single();
            
        if (tableError || !tableData) {
            console.error('Masa bulunamadı:', tableError);
            return;
        }
        
        console.log('Bulunan masa ID:', tableData.id);
        
        // 1. Masa durumunu 'serving' olarak güncelle
        const { error: updateTableError } = await supabase
            .from('tables')
            .update({ status: 'serving' })
            .eq('id', tableData.id);
            
        if (updateTableError) {
            console.error('Masa durumu güncellenemedi:', updateTableError);
            return;
        }
        
        // 2. İlgili çağrıları 'acknowledged' olarak güncelle
        const { error: updateCallsError } = await supabase
            .from('calls')
            .update({ 
                status: 'acknowledged',
                acknowledged_at: new Date().toISOString()
            })
            .eq('table_id', tableData.id)
            .eq('status', 'requested');
            
        if (updateCallsError) {
            console.error('Çağrı durumu güncellenemedi:', updateCallsError);
        }
        
        // Masa durumunu güncelle
        updateTableStatus(tableNumber, 'serving');
        
        // Başarı mesajı göster
        showToast('success', 'Çağrı Yanıtlandı', `Masa ${tableNumber} çağrısı yanıtlandı.`);
        
    } catch (error) {
        console.error('Çağrı yanıtlama hatası:', error);
        showError('Çağrı yanıtlanırken bir hata oluştu.');
    }
}

// Test çağrısı oluştur
async function createTestCall() {
    if (!supabase || !restaurantId) return;
    
    try {
        // Test için rastgele masa numarası
        const testTableNumber = Math.floor(Math.random() * 20) + 1;
        
        console.log(`Test çağrısı oluşturuluyor: Masa ${testTableNumber}`);
        
        // 1. Masa kaydı var mı kontrol et, yoksa oluştur
        const { data: tableData, error: tableError } = await supabase
            .from('tables')
            .select('id')
            .eq('restaurant_id', restaurantId)
            .eq('number', testTableNumber)
            .maybeSingle();
            
        let tableId;
        
        if (tableError && tableError.code !== 'PGRST116') {
            console.error('Masa sorgusu hatası:', tableError);
            return;
        }
        
        if (tableData) {
            tableId = tableData.id;
            
            // Masa durumunu güncelle
            await supabase
                .from('tables')
                .update({ status: 'calling' })
                .eq('id', tableId);
                
        } else {
            // Yeni masa oluştur
            const { data: newTable, error: insertError } = await supabase
                .from('tables')
                .insert({
                    restaurant_id: restaurantId,
                    number: testTableNumber,
                    table_id: testTableNumber,
                    status: 'calling'
                })
                .select()
                .single();
                
            if (insertError) {
                console.error('Test masa oluşturma hatası:', insertError);
                return;
            }
            
            tableId = newTable.id;
        }
        
        // 2. Çağrı oluştur
        const { data: callData, error: callError } = await supabase
            .from('calls')
            .insert({
                table_id: tableId,
                status: 'requested'
            })
            .select()
            .single();
            
        if (callError) {
            console.error('Test çağrı oluşturma hatası:', callError);
            return;
        }
        
        console.log('Test çağrısı oluşturuldu:', callData);
        
    } catch (error) {
        console.error('Test çağrısı oluşturma hatası:', error);
    }
}

// Bildirim sesi çal
function playNotificationSound() {
    try {
        if (audioPlayer) {
            audioPlayer.currentTime = 0;
            audioPlayer.play().catch(err => {
                console.error('Ses çalma hatası:', err);
            });
        }
    } catch (error) {
        console.error('Ses çalma hatası:', error);
    }
}

// Çağrı bildirimi göster
function showCallNotification(tableNumber) {
    try {
        // Tarayıcı bildirimi göster
        if (Notification.permission === 'granted') {
            new Notification('Garson Çağrısı', {
                body: `Masa ${tableNumber} garson çağırıyor!`,
                icon: 'img/logo.png'
            });
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification('Garson Çağrısı', {
                        body: `Masa ${tableNumber} garson çağırıyor!`,
                        icon: 'img/logo.png'
                    });
                }
            });
        }
        
        // Toast bildirimi göster
        showToast('warning', 'Garson Çağrısı', `Masa ${tableNumber} garson çağırıyor!`);
        
    } catch (error) {
        console.error('Bildirim gösterme hatası:', error);
    }
}

// Toast bildirimi göster
function showToast(type, title, message) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `bg-glass-bg backdrop-blur-glass border ${type === 'success' ? 'border-green-500' : type === 'warning' ? 'border-red-500' : 'border-blue-500'} rounded-lg p-4 shadow-lg max-w-xs animate-fade-in`;
    
    toast.innerHTML = `
        <div class="flex items-center">
            <i class="ri-${type === 'success' ? 'checkbox-circle' : type === 'warning' ? 'alarm-warning' : 'information'}-line text-2xl mr-3 ${type === 'success' ? 'text-green-400' : type === 'warning' ? 'text-red-400' : 'text-blue-400'}"></i>
            <div>
                <h4 class="font-bold text-white">${title}</h4>
                <p class="text-gray-300 text-sm">${message}</p>
            </div>
        </div>
    `;
    
    toastContainer.appendChild(toast);
    
    // 5 saniye sonra bildirimi kaldır
    setTimeout(() => {
        toast.classList.add('animate-fade-out');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 5000);
}

// Hata mesajı göster
function showError(message) {
    showToast('error', 'Hata', message);
}

// Başarı mesajı göster
function showSuccess(message) {
    showToast('success', 'Başarılı', message);
} 