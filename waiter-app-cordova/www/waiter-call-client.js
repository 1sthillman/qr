// Supabase bağlantısı - 1sthillman/qr projesine uyumlu
const SUPABASE_URL = 'https://wihdzkvgttfwsiijxidy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpaGR6a3ZndHRmd3NpaWp4aWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MzA0MjIsImV4cCI6MjA2NjIwNjQyMn0.Cpn6y7ybyLA3uL-bjvsxPKoIw-J7I6eTE5cPGnBjOo4';

// Global değişkenler
let supabase;
let restaurantId = '';
let tableNumber = '';
let tableId = null;
let currentCallId = null;
let isCallActive = false;
let currentStatus = 'idle';
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 3;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
    console.log('Sayfa yüklendi');
    
    // URL parametrelerini al
    const urlParams = new URLSearchParams(window.location.search);
    restaurantId = urlParams.get('restaurant_id');
    
    // table_id veya table parametresi kontrolü
    tableNumber = urlParams.get('table_id') || urlParams.get('table');
    
    // Değerler yoksa hata göster ve yükleme ekranını kaldır
    if (!restaurantId || !tableNumber) {
        hideLoader();
        showError('QR kodda eksik bilgi var. Lütfen geçerli bir QR kod kullanın.');
        console.error('Eksik parametreler:', { restaurantId, tableNumber });
        return;
    }
    
    console.log('Parametreler alındı:', { restaurantId, tableNumber });
    
    // Supabase'i başlat
    if (!initSupabase()) {
        // Başarısız olsa bile yükleme ekranını kapat
        hideLoader();
        return;
    }
    
    // Masa ve restoran bilgilerini göster
    document.getElementById('tableNumber').textContent = tableNumber;
    document.getElementById('restaurantName').textContent = `Restaurant ${restaurantId}`;
    
    // Masa kaydını kontrol et veya oluştur
    checkOrCreateTable()
        .catch(err => {
            console.error('Masa kontrolü sırasında hata:', err);
            showError('Bağlantı hatası. Lütfen sayfayı yenileyin.');
        })
        .finally(() => {
            // İşlem başarılı veya başarısız olsa da yükleme ekranını kaldır
            hideLoader();
        });
    
    // Çağrı butonunu ayarla
    setupCallButton();
    
    // Yükleme yavaş olsa bile 5 saniye sonra her durumda yükleme ekranını gizle
    setTimeout(hideLoader, 5000);
});

// Loader'ı gizle ve ana sayfayı göster
function hideLoader() {
    // Yükleme ekranını kademeli olarak gizle
    const loadingPage = document.getElementById('loadingPage');
    if (loadingPage) {
        loadingPage.style.opacity = '0';
        loadingPage.style.transition = 'opacity 0.5s ease';
        
        setTimeout(() => {
            loadingPage.style.display = 'none';
        }, 500);
    }
    
    // Ana sayfayı kademeli göster
    const qrPage = document.getElementById('qrPage');
    if (qrPage) {
        qrPage.style.display = 'flex';
        
        setTimeout(() => {
            qrPage.classList.add('visible');
        }, 50); // Kısa bir gecikme ile CSS transition'ın çalışmasını sağla
    }
    
    // Buton durumunu güncelle
    updateButtonState();
}

// Supabase istemcisini başlat
function initSupabase() {
    try {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase bağlantısı başarılı');
        
        // Supabase ile bağlantıyı test et
        supabase.from('tables').select('id').limit(1)
            .then(response => {
                if (response.error) throw new Error('Supabase bağlantı testi başarısız');
                console.log('Supabase bağlantı testi başarılı');
            })
            .catch(err => {
                console.error('Supabase bağlantı testi hatası:', err);
                retrySupabaseConnection();
            });
        
        return true;
    } catch (error) {
        console.error('Supabase başlatma hatası:', error);
        showError('Veritabanı bağlantısı kurulamadı. Lütfen tekrar deneyin.');
        retrySupabaseConnection();
        return false;
    }
}

// Supabase bağlantısını yeniden deneme
function retrySupabaseConnection() {
    connectionAttempts++;
    if (connectionAttempts <= MAX_CONNECTION_ATTEMPTS) {
        console.log(`Supabase bağlantısı yeniden deneniyor (${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})...`);
        setTimeout(initSupabase, 1000);
    } else {
        console.error('Maksimum bağlantı deneme sayısına ulaşıldı');
        showError('Sunucu bağlantısı kurulamadı. Lütfen internet bağlantınızı kontrol edin ve sayfayı yenileyin.');
    }
}

// Masa kaydını kontrol et veya oluştur
async function checkOrCreateTable() {
    if (!supabase) return;
    
    try {
        console.log(`Masa kontrolü yapılıyor: Restaurant ${restaurantId}, Masa ${tableNumber}`);
        
        // Önce masa var mı kontrol et
        const { data, error } = await supabase
            .from('tables')
            .select('id, status')
            .eq('restaurant_id', restaurantId)
            .eq('table_id', parseInt(tableNumber))
            .single();
        
        if (error && error.code !== 'PGRST116') { // PGRST116: No rows returned
            console.error('Masa sorgusu hatası:', error);
            return;
        }
        
        if (data) {
            // Masa bulundu
            tableId = data.id;
            currentStatus = data.status || 'idle';
            console.log(`Masa bulundu: ID=${tableId}, Status=${currentStatus}`);
        } else {
            // Masa yoksa oluştur
            const { data: newTable, error: insertError } = await supabase
                .from('tables')
                .insert({
                    restaurant_id: restaurantId,
                    table_id: parseInt(tableNumber),
                    number: parseInt(tableNumber),
                    status: 'idle'
                })
                .select()
                .single();
            
            if (insertError) {
                console.error('Masa oluşturma hatası:', insertError);
                return;
            }
            
            tableId = newTable.id;
            currentStatus = 'idle';
            console.log(`Yeni masa oluşturuldu: ID=${tableId}`);
        }
        
        // Aktif çağrı var mı kontrol et
        checkActiveCall();
        
        // Realtime bağlantıyı kur
        setupRealtimeConnection();
        
    } catch (err) {
        console.error('Masa kontrolü hatası:', err);
        throw err;
    }
}

// Aktif çağrı var mı kontrol et
async function checkActiveCall() {
    if (!supabase || !tableId) return;
    
    try {
        const { data, error } = await supabase
            .from('calls')
            .select('id, status')
            .eq('table_id', tableId)
            .eq('status', 'requested')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        
        if (error && error.code !== 'PGRST116') {
            console.error('Çağrı sorgusu hatası:', error);
            return;
        }
        
        if (data) {
            // Aktif çağrı var
            currentCallId = data.id;
            isCallActive = true;
            currentStatus = 'calling';
            console.log(`Aktif çağrı bulundu: ID=${currentCallId}`);
            
            // Buton durumunu güncelle
            updateButtonState();
        }
    } catch (err) {
        console.error('Aktif çağrı kontrolü hatası:', err);
    }
}

// Çağrı butonunu ayarla
function setupCallButton() {
    const callButton = document.getElementById('callWaiterButton');
    
    if (!callButton) return;
    
    callButton.addEventListener('click', function() {
        callWaiter();
    });
    
    // Başlangıç durumunu ayarla
    updateButtonState();
}

// Garson çağırma fonksiyonu
async function callWaiter() {
    try {
        const callButton = document.getElementById('callWaiterButton');
        
        // Butonu devre dışı bırak
        callButton.disabled = true;
        callButton.innerHTML = '<i class="ri-loader-2-line animate-spin mr-2"></i> Garson çağrılıyor...';
        
        console.log('Garson çağırma işlemi başlatıldı:', { restaurantId, tableNumber, tableId });
        
        // Masa ID'si yoksa tekrar kontrol et
        if (!tableId) {
            await checkOrCreateTable();
            if (!tableId) {
                console.error('Masa ID bulunamadı');
                showError('Masa bilgisi bulunamadı. Lütfen tekrar deneyin.');
                resetCallButton(callButton);
                return;
            }
        }
        
        // 1. Masa durumunu 'calling' olarak güncelle
        const { error: tableError } = await supabase
            .from('tables')
            .update({
                status: 'calling',
                updated_at: new Date().toISOString()
            })
            .eq('id', tableId);
            
        if (tableError) {
            console.error('Masa durumu güncellenemedi:', tableError);
            showError('Masa durumu güncellenemedi. Lütfen tekrar deneyin.');
            resetCallButton(callButton);
            return;
        }
        
        console.log(`Masa ${tableNumber} durumu 'calling' olarak güncellendi`);
        
        // 2. Çağrı oluştur (1sthillman/qr projesine uyumlu)
        const { data: callData, error: callError } = await supabase
            .from('calls')
            .insert({
                table_id: tableId,
                status: 'requested'
            })
            .select()
            .single();
            
        if (callError) {
            console.error('Garson çağrısı oluşturulamadı:', callError);
            showError('Garson çağrısı yapılamadı. Lütfen tekrar deneyin.');
            resetCallButton(callButton);
            return;
        }
        
        // Çağrı ID'sini kaydet
        currentCallId = callData.id;
        isCallActive = true;
        currentStatus = 'calling';
        
        console.log('Çağrı başarıyla oluşturuldu:', { callId: currentCallId });
        
        // Realtime bağlantıyı güncelle
        setupRealtimeConnection();
        
        // Başarı mesajı göster
        showSuccess('Garson çağrınız alındı. En kısa sürede sizinle ilgileneceğiz.');
        
        // Buton durumunu güncelle
        updateButtonState();
        
    } catch (error) {
        console.error('Garson çağırma hatası:', error);
        showError('Bir hata oluştu. Lütfen tekrar deneyin.');
        resetCallButton(document.getElementById('callWaiterButton'));
    }
}

// Buton durumunu güncelle
function updateButtonState() {
    const callButton = document.getElementById('callWaiterButton');
    if (!callButton) return;
    
    if (currentStatus === 'calling') {
        callButton.disabled = true;
        callButton.classList.add('calling');
        callButton.innerHTML = '<i class="ri-time-line mr-2"></i> Garson Geliyor';
    } else if (currentStatus === 'serving') {
        callButton.disabled = true;
        callButton.classList.add('serving');
        callButton.innerHTML = '<i class="ri-user-smile-line mr-2"></i> Garson Geliyor';
    } else {
        callButton.disabled = false;
        callButton.classList.remove('calling', 'serving');
        callButton.innerHTML = '<i class="ri-user-voice-line mr-2"></i> Garsonu Çağır';
    }
}

// Butonu sıfırla
function resetCallButton(button) {
    if (!button) return;
    
    button.disabled = false;
    button.innerHTML = '<i class="ri-user-voice-line mr-2"></i> Garsonu Çağır';
}

// Realtime bağlantıyı kur
function setupRealtimeConnection() {
    if (!supabase) {
        console.error('Supabase bağlantısı yok, realtime dinleme yapılamıyor');
        return;
    }
    
    if (!tableId) {
        console.error('Masa ID yok, realtime dinleme yapılamıyor');
        return;
    }
    
    console.log('Realtime bağlantı kuruluyor...', { tableId, currentCallId });
    
    try {
        // Önceki kanalları temizle
        const tableChannel = supabase.channel('table-status-changes');
        if (tableChannel) {
            tableChannel.unsubscribe();
            console.log('Önceki masa kanalı aboneliği iptal edildi');
        }
        
        const callChannel = supabase.channel('call-status-changes');
        if (callChannel) {
            callChannel.unsubscribe();
            console.log('Önceki çağrı kanalı aboneliği iptal edildi');
        }
        
        // Masa durumu değişikliklerini dinle
        supabase
            .channel('table-status-changes')
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'tables',
                filter: `id=eq.${tableId}`
            }, payload => {
                console.log('Masa durumu değişti:', payload);
                
                if (payload.new && payload.new.status) {
                    currentStatus = payload.new.status;
                    console.log(`Masa durumu güncellendi: ${currentStatus}`);
                    updateButtonState();
                    
                    if (currentStatus === 'serving') {
                        showWaiterResponse('Garsonunuz geliyor!');
                    } else if (currentStatus === 'idle') {
                        isCallActive = false;
                        currentCallId = null;
                        showWaiterResponse('Çağrınız tamamlandı.');
                    }
                }
            })
            .subscribe(status => {
                console.log('Masa durumu dinleme durumu:', status);
            });
        
        // Çağrı durumu değişikliklerini dinle
        if (currentCallId) {
            supabase
                .channel('call-status-changes')
                .on('postgres_changes', { 
                    event: '*', 
                    schema: 'public', 
                    table: 'calls',
                    filter: `id=eq.${currentCallId}`
                }, payload => {
                    console.log('Çağrı durumu değişti:', payload);
                    
                    if (payload.new && payload.new.status === 'acknowledged') {
                        showWaiterResponse('Garsonunuz çağrınızı onayladı ve geliyor!');
                        isCallActive = false;
                        currentStatus = 'serving';
                        updateButtonState();
                    }
                })
                .subscribe(status => {
                    console.log('Çağrı durumu dinleme durumu:', status);
                });
        }
    } catch (error) {
        console.error('Realtime bağlantı kurulurken hata:', error);
    }
}

// Hata mesajı göster
function showError(message) {
    const errorAlert = document.getElementById('errorAlert');
    if (!errorAlert) return;
    
    errorAlert.textContent = message;
    errorAlert.style.display = 'block';
    
    setTimeout(() => {
        errorAlert.style.display = 'none';
    }, 5000);
}

// Başarı mesajı göster
function showSuccess(message) {
    const successAlert = document.getElementById('successAlert');
    if (!successAlert) return;
    
    successAlert.textContent = message;
    successAlert.style.display = 'block';
    
    setTimeout(() => {
        successAlert.style.display = 'none';
    }, 5000);
}

// Garson yanıt mesajı göster
function showWaiterResponse(message) {
    const waiterResponseAlert = document.getElementById('waiterResponseAlert');
    if (!waiterResponseAlert) return;
    
    waiterResponseAlert.textContent = message;
    waiterResponseAlert.style.display = 'block';
    
    setTimeout(() => {
        waiterResponseAlert.style.display = 'none';
    }, 10000);
} 