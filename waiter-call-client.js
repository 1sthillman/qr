// Supabase bağlantısı - 1sthillman/qr projesine uyumlu
const SUPABASE_URL = 'https://wihdzkvgttfwsiijxidy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpaGR6a3ZndHRmd3NpaWp4aWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MzA0MjIsImV4cCI6MjA2NjIwNjQyMn0.Cpn6y7ybyLA3uL-bjvsxPKoIw-J7I6eTE5cPGnBjOo4';

// Global değişkenler
let supabase;
let tableChannel = null;
let callChannel = null;
let restaurantId = '';
let tableNumber = '';
let tableId = null;
let currentCallId = null;
let isCallActive = false;
let currentStatus = 'idle';
let connectionRetries = 0;
const MAX_RETRIES = 3;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', function() {
    console.log('Sayfa yüklendi');
    
    // URL parametrelerini al
    const urlParams = new URLSearchParams(window.location.search);
    restaurantId = urlParams.get('restaurant_id');
    
    // table_id veya table parametresi kontrolü
    tableNumber = urlParams.get('table_id') || urlParams.get('table');
    
    // Değerler yoksa hata göster
    if (!restaurantId || !tableNumber) {
        showError('QR kodda eksik bilgi var. Lütfen geçerli bir QR kod kullanın.');
        console.error('Eksik parametreler:', { restaurantId, tableNumber });
        return;
    }
    
    console.log('Parametreler alındı:', { restaurantId, tableNumber });
    
    // Supabase'i başlat
    initSupabase();
    
    // Sayfa içeriğini göster
    document.getElementById('loadingPage').style.display = 'none';
    document.getElementById('qrPage').style.display = 'flex';
    
    // Masa ve restoran bilgilerini göster
    document.getElementById('tableNumber').textContent = tableNumber;
    document.getElementById('restaurantName').textContent = `Restaurant ${restaurantId}`;
    
    // Masa kaydını kontrol et veya oluştur
    checkOrCreateTable();
    
    // Çağrı butonunu ayarla
    setupCallButton();
    
    // Realtime bağlantıyı kur
    setupRealtimeConnection();
});

// Supabase istemcisini başlat
function initSupabase() {
    try {
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
                setTimeout(() => setupRealtimeConnection(), 2000); // 2 saniye sonra tekrar dene
            } else {
                showError('Sunucu bağlantısı kesildi. Lütfen sayfayı yenileyin.');
            }
        });
        
        return true;
    } catch (error) {
        console.error('Supabase başlatma hatası:', error);
        showError('Veritabanı bağlantısı kurulamadı. Lütfen tekrar deneyin.');
        return false;
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
            .eq('number', parseInt(tableNumber, 10))
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
                    number: parseInt(tableNumber, 10),
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
        
    } catch (err) {
        console.error('Masa kontrolü hatası:', err);
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

// Buton durumunu güncelle
function updateButtonState() {
    const callButton = document.getElementById('callWaiterButton');
    if (!callButton) return;
    
    if (isCallActive) {
        callButton.disabled = true;
        callButton.innerHTML = '<i class="ri-check-line mr-2"></i> Garson Çağrıldı';
        callButton.classList.add('bg-green-600');
        callButton.classList.remove('bg-primary');
    } else {
        callButton.disabled = false;
        callButton.innerHTML = '<i class="ri-user-voice-line mr-2"></i> Garsonu Çağır';
        callButton.classList.add('bg-primary');
        callButton.classList.remove('bg-green-600');
    }
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

// Çağrı butonunu sıfırla
function resetCallButton(button) {
    button.disabled = false;
    button.innerHTML = '<i class="ri-user-voice-line mr-2"></i> Garsonu Çağır';
}

// Realtime bağlantıyı kur
function setupRealtimeConnection() {
    if (!supabase) {
        console.error('Supabase bağlantısı yok, realtime dinleme yapılamıyor');
        return;
    }
    
    // Önceki kanalları temizle
    if (tableChannel) {
        tableChannel.unsubscribe();
        console.log('Önceki masa kanalı aboneliği iptal edildi');
    }
    
    if (callChannel) {
        callChannel.unsubscribe();
        console.log('Önceki çağrı kanalı aboneliği iptal edildi');
    }
    
    console.log('Realtime bağlantı kuruluyor...', { tableId, currentCallId });
    
    try {
        // 1. Çağrı durumunu dinle
        if (currentCallId) {
            callChannel = supabase
                .channel(`call-status-${currentCallId}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'calls',
                    filter: `id=eq.${currentCallId}`
                }, (payload) => {
                    console.log('Çağrı durumu değişti:', payload);
                    
                    if (payload.new.status === 'acknowledged') {
                        showWaiterResponse('Garsonunuz geliyor!');
                        isCallActive = false;
                        updateButtonState();
                    } else if (payload.new.status === 'completed') {
                        isCallActive = false;
                        updateButtonState();
                    }
                })
                .subscribe(status => {
                    console.log(`Çağrı kanalı durumu (ID: ${currentCallId}):`, status);
                });
        }
            
        // 2. Masa durumunu dinle
        if (tableId) {
            tableChannel = supabase
                .channel(`table-status-${tableId}`)
                .on('postgres_changes', {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'tables',
                    filter: `id=eq.${tableId}`
                }, (payload) => {
                    console.log('Masa durumu değişti:', payload);
                    
                    if (payload.new.status === 'serving') {
                        showWaiterResponse('Garsonunuz geliyor!');
                        isCallActive = false;
                        currentStatus = 'serving';
                        updateButtonState();
                    } else if (payload.new.status === 'idle') {
                        isCallActive = false;
                        currentStatus = 'idle';
                        updateButtonState();
                    }
                })
                .subscribe(status => {
                    console.log(`Masa kanalı durumu (ID: ${tableId}):`, status);
                });
        }
    } catch (error) {
        console.error('Realtime bağlantı hatası:', error);
    }
}

// Hata mesajı göster
function showError(message) {
    const errorAlert = document.getElementById('errorAlert');
    errorAlert.textContent = message;
    errorAlert.style.display = 'block';
    
    // 5 saniye sonra mesajı gizle
    setTimeout(() => {
        errorAlert.style.display = 'none';
    }, 5000);
}

// Başarı mesajı göster
function showSuccess(message) {
    const successAlert = document.getElementById('successAlert');
    successAlert.textContent = message;
    successAlert.style.display = 'block';
    
    // 5 saniye sonra mesajı gizle
    setTimeout(() => {
        successAlert.style.display = 'none';
    }, 5000);
}

// Garson yanıtını göster
function showWaiterResponse(message) {
    const responseAlert = document.getElementById('waiterResponseAlert');
    responseAlert.textContent = message;
    responseAlert.style.display = 'block';
    
    // 8 saniye sonra mesajı gizle
    setTimeout(() => {
        responseAlert.style.display = 'none';
    }, 8000);
} 