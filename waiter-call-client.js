// Supabase bağlantı bilgileri
// NOT: Gerçek uygulamada bu bilgiler environment variables ile yönetilmeli
const SUPABASE_URL = 'https://wihdzkvgttfwsiijxidy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpaGR6a3ZndHRmd3NpaWp4aWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MzA0MjIsImV4cCI6MjA2NjIwNjQyMn0.Cpn6y7ybyLA3uL-bjvsxPKoIw-J7I6eTE5cPGnBjOo4';

// Global değişkenler
let supabase = null;
let channel = null;
let currentCallId = null;
let restaurantId = null;
let tableId = null;
let tableNumber = null;

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
        
        // Restoran bilgilerini al
        const { data: restaurantData, error: restaurantError } = await supabase
            .from('restaurants')
            .select('name')
            .eq('id', restaurantId)
            .single();
            
        if (restaurantError || !restaurantData) {
            console.error('Restoran bilgisi alınamadı:', restaurantError);
            showError('Restoran bilgisi bulunamadı.');
            return;
        }
        
        // Masa bilgisini al
        const { data: tableData, error: tableError } = await supabase
            .from('tables')
            .select('id')
            .eq('restaurant_id', restaurantId)
            .eq('number', parseInt(tableNumber))
            .single();
            
        if (tableError || !tableData) {
            console.error('Masa bilgisi alınamadı:', tableError);
            showError('Masa bilgisi bulunamadı.');
            return;
        }
        
        // Global değişkenleri güncelle
        tableId = tableData.id;
        
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
        
    } catch (error) {
        console.error('Sayfa başlatma hatası:', error);
        showError('Bir hata oluştu. Lütfen sayfayı yenileyin.');
    }
}

// Realtime bağlantı kurulumu
function setupRealtimeConnection() {
    // Eğer önceden bir bağlantı varsa kapat
    if (channel) {
        channel.unsubscribe();
    }
    
    // Yeni bağlantı kur
    channel = supabase
        .channel('call-status')
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: currentCallId ? `id=eq.${currentCallId}` : undefined
        }, (payload) => {
            if (payload.new.status === 'acknowledged') {
                showWaiterResponse('Garsonunuz geliyor!');
            }
        })
        .subscribe();
}

// Garson çağırma fonksiyonu
async function callWaiter() {
    try {
        const callButton = document.getElementById('callWaiterButton');
        
        // Butonu devre dışı bırak
        callButton.disabled = true;
        callButton.innerHTML = '<i class="ri-loader-2-line animate-spin mr-2"></i> Garson çağrılıyor...';
        
        // Çağrı oluştur
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
        
        // Realtime bağlantıyı güncelle
        setupRealtimeConnection();
        
        // Başarı mesajı göster
        showSuccess('Garson çağrınız alındı. En kısa sürede sizinle ilgileneceğiz.');
        
        // 30 saniye sonra butonu tekrar aktif et
        setTimeout(() => {
            resetCallButton(callButton);
        }, 30000);
        
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