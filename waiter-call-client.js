// Supabase bağlantısı
const SUPABASE_URL = 'https://wihdzkvgttfwsiijxidy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpaGR6a3ZndHRmd3NpaWp4aWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTk0MzM2MjMsImV4cCI6MjAzNTAwOTYyM30.JmXQYrT6wyIL7HaDO3LNUg9crDkA2yW6ADlX_iMzn6c';
const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM elementleri
const callButton = document.getElementById('call-button');
const restaurantName = document.getElementById('restaurant-name');
const tableNumber = document.getElementById('table-number');
const statusRequested = document.getElementById('status-requested');
const statusAcknowledged = document.getElementById('status-acknowledged');

// URL parametreleri
const urlParams = new URLSearchParams(window.location.search);
const restaurantId = urlParams.get('restaurant_id');
const tableId = urlParams.get('table_id');

let currentCallId = null;

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', async () => {
    if (!restaurantId || !tableId) {
        showError('Geçersiz QR kod! Masa bilgileri eksik.');
        return;
    }

    // Restoran ve masa bilgilerini al
    try {
        await loadRestaurantAndTableInfo();
        setupCallButton();
        setupRealtimeListener();
    } catch (error) {
        console.error('Hata:', error);
        showError('Bağlantı hatası! Lütfen tekrar deneyiniz.');
    }
});

// Restoran ve masa bilgilerini yükleme
async function loadRestaurantAndTableInfo() {
    // Restoran bilgilerini al
    const { data: restaurantData, error: restaurantError } = await supabase
        .from('restaurants')
        .select('name')
        .eq('id', restaurantId)
        .single();

    if (restaurantError || !restaurantData) {
        throw new Error('Restoran bilgileri alınamadı');
    }

    // Masa bilgilerini al
    const { data: tableData, error: tableError } = await supabase
        .from('tables')
        .select('number')
        .eq('id', tableId)
        .single();

    if (tableError || !tableData) {
        throw new Error('Masa bilgileri alınamadı');
    }

    // Bilgileri göster
    restaurantName.textContent = restaurantData.name;
    tableNumber.textContent = `Masa ${tableData.number}`;
}

// Çağrı butonunu ayarlama
function setupCallButton() {
    callButton.addEventListener('click', async () => {
        try {
            callButton.disabled = true;
            
            // Yeni çağrı oluştur
            const { data, error } = await supabase
                .from('calls')
                .insert({
                    table_id: tableId,
                    status: 'requested'
                })
                .select()
                .single();

            if (error) throw error;

            currentCallId = data.id;
            statusRequested.classList.add('requested');
            
            // Başarı gösteriminden sonra butonu gizle
            callButton.style.display = 'none';
            
        } catch (error) {
            console.error('Çağrı oluşturma hatası:', error);
            callButton.disabled = false;
            showError('Çağrı oluşturulurken bir hata oluştu. Lütfen tekrar deneyiniz.');
        }
    });
}

// Realtime dinleyici kurulumu
function setupRealtimeListener() {
    const callsChannel = supabase
        .channel('public:calls')
        .on('postgres_changes', 
            {
                event: 'UPDATE', 
                schema: 'public', 
                table: 'calls',
                filter: `table_id=eq.${tableId}`
            }, 
            (payload) => {
                if (payload.new && payload.new.status === 'acknowledged') {
                    statusRequested.classList.remove('requested');
                    statusAcknowledged.classList.add('acknowledged');
                }
            })
        .subscribe();
}

// Hata gösterme
function showError(message) {
    alert(message);
} 