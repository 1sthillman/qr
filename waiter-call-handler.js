// Garson çağırma işlemleri için yardımcı fonksiyonlar
const SUPABASE_URL = 'https://egcklzfiyxxnvyxwoowq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVnY2tsemZpeXh4bnZ5eHdvb3dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg0NjQxMTcsImV4cCI6MjA2NDA0MDExN30.dfRQv3lYFCaI1T5ydOw4HyoEJ0I1wOSIUcG8ueEbxKQ';
let supabase;

// Supabase bağlantısını başlat
function initWaiterCallHandler() {
    if (!supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
}

// Waiter Calls tablosunu oluştur
async function createWaiterCallsTable() {
    try {
        const { error } = await supabase.rpc('create_waiter_calls_table');
        if (error) {
            console.error('Waiter calls tablosu oluşturulamadı:', error);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Waiter calls tablosu oluşturma hatası:', err);
        return false;
    }
}

// QR kodu oluştur
function generateQRCodeForTable(tableNumber) {
    const appUrl = window.location.origin;
    const qrUrl = `${appUrl}/qr.html?table=${tableNumber}`;
    return qrUrl;
}

// QR kod modalını göster
function showQRCodeModal(tableNumber) {
    const qrUrl = generateQRCodeForTable(tableNumber);
    
    const modalHtml = `
        <div class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-lg p-6 max-w-sm w-full">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-medium">Masa ${tableNumber} QR Kodu</h3>
                    <button id="closeQrModal" class="text-gray-400 hover:text-gray-600">
                        <i class="ri-close-line text-2xl"></i>
                    </button>
                </div>
                
                <div class="text-center mb-4">
                    <p class="text-gray-600 mb-4">Müşterileriniz bu QR kodu telefonlarıyla okutarak garsonu çağırabilirler.</p>
                    
                    <div class="bg-white p-3 border rounded-lg inline-block mb-4">
                        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}" 
                             alt="Masa ${tableNumber} QR Kodu" 
                             class="w-48 h-48">
                    </div>
                    
                    <div class="text-sm">
                        <p class="font-medium">URL:</p>
                        <p class="text-blue-500 break-words">${qrUrl}</p>
                    </div>
                </div>
                
                <div class="flex justify-center mt-2">
                    <button id="printQrCodeBtn" class="bg-primary text-white px-4 py-2 rounded-button mr-2">
                        <i class="ri-printer-line mr-1"></i>
                        Yazdır
                    </button>
                    <a href="${qrUrl}" target="_blank" class="bg-gray-200 text-gray-700 px-4 py-2 rounded-button">
                        <i class="ri-external-link-line mr-1"></i>
                        Açık
                    </a>
                </div>
            </div>
        </div>
    `;
    
    // Modal containerını oluştur
    const qrModalContainer = document.createElement('div');
    qrModalContainer.id = 'qrModalContainer';
    qrModalContainer.innerHTML = modalHtml;
    document.body.appendChild(qrModalContainer);
    
    // Modal kapama düğmesi için event listener
    document.getElementById('closeQrModal').addEventListener('click', () => {
        document.body.removeChild(qrModalContainer);
    });
    
    // Yazdırma düğmesi için event listener
    document.getElementById('printQrCodeBtn').addEventListener('click', () => {
        printQRCode(tableNumber, qrUrl);
    });
}

// QR kodu yazdır
function printQRCode(tableNumber, qrUrl) {
    const printWindow = window.open('', '_blank');
    
    printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Masa ${tableNumber} QR Kodu</title>
            <style>
                body { font-family: Arial, sans-serif; text-align: center; }
                .qr-container { margin: 20px auto; }
                h1 { font-size: 24px; margin-bottom: 10px; }
                p { font-size: 16px; margin-bottom: 20px; }
                .restaurant-name { font-size: 28px; font-weight: bold; margin-bottom: 5px; }
                .table-info { font-size: 22px; margin: 15px 0; }
                .instructions { font-size: 18px; margin: 15px 0 25px 0; }
            </style>
        </head>
        <body>
            <div class="qr-container">
                <p class="restaurant-name">Restaurant App</p>
                <h1 class="table-info">Masa ${tableNumber}</h1>
                <p class="instructions">Garsonu çağırmak için QR kodu tarayın</p>
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qrUrl)}" alt="QR Kod">
                <p>${qrUrl}</p>
            </div>
        </body>
        </html>
    `);
    
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
        printWindow.print();
    }, 500);
}

// Aktif garson çağrılarını yükle
async function loadActiveWaiterCalls() {
    try {
        const { data, error } = await supabase
            .from('waiter_calls')
            .select('*')
            .eq('status', 'waiting')
            .order('created_at', { ascending: false });
            
        if (error) {
            console.error('Garson çağrıları yüklenirken hata:', error);
            return [];
        }
        
        return data || [];
    } catch (err) {
        console.error('Garson çağrıları yükleme hatası:', err);
        return [];
    }
}

// Garson çağrısını yanıtla
async function respondToWaiterCall(tableNumber, waiterName) {
    try {
        // Çağrı durumunu güncelle
        const { data, error } = await supabase
            .from('waiter_calls')
            .update({ 
                status: 'responded', 
                responded_at: new Date().toISOString(),
                responded_by: waiterName
            })
            .eq('table_number', tableNumber)
            .eq('status', 'waiting');
            
        if (error) {
            console.error('Garson çağrısı yanıtlama hatası:', error);
            return false;
        }
        
        // Masa QR sayfasına bildirim gönder
        await supabase.channel(`table-${tableNumber}`)
            .send({
                type: 'broadcast',
                event: 'waiter-response',
                payload: { 
                    tableNumber: tableNumber,
                    message: `${waiterName} masanıza geliyor.`
                }
            });
            
        return true;
    } catch (err) {
        console.error('Garson çağrısı yanıtlama hatası:', err);
        return false;
    }
}

// Supabase kurulumu için migration dosyası
const waiterCallsMigration = `
-- Waiter Calls tablosu
CREATE TABLE IF NOT EXISTS waiter_calls (
  id SERIAL PRIMARY KEY,
  table_number INTEGER NOT NULL,
  status TEXT DEFAULT 'waiting',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
  responded_at TIMESTAMP WITH TIME ZONE,
  responded_by TEXT
);

-- Waiter Calls tablosu oluşturma fonksiyonu
CREATE OR REPLACE FUNCTION create_waiter_calls_table()
RETURNS BOOLEAN AS $$
BEGIN
  CREATE TABLE IF NOT EXISTS waiter_calls (
    id SERIAL PRIMARY KEY,
    table_number INTEGER NOT NULL,
    status TEXT DEFAULT 'waiting',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    responded_at TIMESTAMP WITH TIME ZONE,
    responded_by TEXT
  );
  RETURN TRUE;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Realtime özelliğini etkinleştir
ALTER PUBLICATION supabase_realtime ADD TABLE waiter_calls;
`;

// Dışa aktarılan fonksiyonlar
export {
    initWaiterCallHandler,
    createWaiterCallsTable,
    generateQRCodeForTable,
    showQRCodeModal,
    printQRCode,
    loadActiveWaiterCalls,
    respondToWaiterCall,
    waiterCallsMigration
}; 