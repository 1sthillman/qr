// Supabase bağlantı bilgileri
// NOT: Gerçek uygulamada bu bilgiler environment variables ile yönetilmeli
const SUPABASE_URL = 'https://wihdzkvgttfwsiijxidy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpaGR6a3ZndHRmd3NpaWp4aWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MzA0MjIsImV4cCI6MjA2NjIwNjQyMn0.Cpn6y7ybyLA3uL-bjvsxPKoIw-J7I6eTE5cPGnBjOo4';

// Global değişkenler
let supabase = null;
let tableChannel = null;
let callChannel = null;
let currentCallId = null;
let restaurantId = null;
let tableId = null;
let tableNumber = null;
let isCallActive = false;
let currentStatus = 'idle';
let connectionRetries = 0;
const MAX_RETRIES = 3;

// Sayfa yüklendiğinde çalış
document.addEventListener('DOMContentLoaded', () => {
    initWaiterCallPage();
});

// Sayfa başlatma
async function initWaiterCallPage() {
    try {
        // URL parametrelerini al
        const urlParams = new URLSearchParams(window.location.search);
        restaurantId = urlParams.get('restaurant_id');
        tableNumber = urlParams.get('table_id');
        
        if (!restaurantId || !tableNumber) {
            showError('Geçersiz QR kod. Restoran veya masa bilgisi eksik.');
            return;
        }
        
        // Supabase bağlantısını oluştur
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        
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
        
        // Hata ayıklama için
        console.log('Supabase bağlantısı kuruldu');
        console.log('Restoran ID:', restaurantId);
        console.log('Masa Numarası:', tableNumber);
        
        try {
            // Restoran bilgilerini al
            const { data: restaurantData, error: restaurantError } = await supabase
                .from('restaurants')
                .select('*')
                .eq('id', restaurantId)
                .single();
                
            console.log('Restoran sorgusu sonucu:', { data: restaurantData, error: restaurantError });
                
            if (restaurantError) {
                console.error('Restoran bilgisi alınamadı:', restaurantError);
                showError('Restoran bilgisi bulunamadı. Hata: ' + restaurantError.message);
                return;
            }
            
            if (!restaurantData) {
                console.error('Restoran bulunamadı');
                showError('Restoran bilgisi bulunamadı.');
                return;
            }
            
            // Masa bilgisini al veya oluştur
            await checkOrCreateTable();
            
            // Sayfa içeriğini güncelle
            document.getElementById('restaurantName').textContent = restaurantData.name;
            document.getElementById('tableNumber').textContent = tableNumber;
            
            // Yükleme ekranını gizle, ana sayfayı göster
            document.getElementById('loadingPage').classList.add('hidden');
            document.getElementById('qrPage').classList.remove('hidden');
            
            // Garson çağırma butonuna event listener ekle
            document.getElementById('callWaiterButton').addEventListener('click', callWaiter);
            
            // Realtime bağlantıyı kur
            setupRealtimeConnection();
        } catch (innerError) {
            console.error('Veri çekme hatası:', innerError);
            showError('Veri çekilirken bir hata oluştu: ' + innerError.message);
        }
        
    } catch (error) {
        console.error('Sayfa başlatma hatası:', error);
        showError('Bir hata oluştu. Lütfen sayfayı yenileyin. Hata: ' + error.message);
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
        await checkActiveCall();
        
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

// Realtime bağlantı kurulumu
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

// Hata mesajı göster
function showError(message) {
    const errorAlert = document.getElementById('errorAlert');
    errorAlert.textContent = message;
    errorAlert.classList.remove('hidden');
    
    // Yükleme ekranını gizle (hata durumunda)
    document.getElementById('loadingPage').classList.add('hidden');
    
    // 5 saniye sonra mesajı gizle
    setTimeout(() => {
        errorAlert.classList.add('hidden');
    }, 5000);
}

// Başarı mesajı göster
function showSuccess(message) {
    const successAlert = document.getElementById('successAlert');
    successAlert.textContent = message;
    successAlert.classList.remove('hidden');
    
    // 5 saniye sonra mesajı gizle
    setTimeout(() => {
        successAlert.classList.add('hidden');
    }, 5000);
}

// Garson yanıtını göster
function showWaiterResponse(message) {
    const responseAlert = document.getElementById('waiterResponseAlert');
    responseAlert.textContent = message;
    responseAlert.classList.remove('hidden');
    
    // 8 saniye sonra mesajı gizle
    setTimeout(() => {
        responseAlert.classList.add('hidden');
    }, 8000);
} 