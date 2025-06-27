// Supabase bağlantısı
const SUPABASE_URL = 'https://wihdzkvgttfwsiijxidy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpaGR6a3ZndHRmd3NpaWp4aWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTk0MzM2MjMsImV4cCI6MjAzNTAwOTYyM30.JmXQYrT6wyIL7HaDO3LNUg9crDkA2yW6ADlX_iMzn6c';

// Supabase istemcisini başlat
let supabase;
if (typeof window !== 'undefined' && window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Yeni çağrı oluştur
 * @param {string} tableId - Masa ID'si
 * @returns {Promise} - Çağrı sonucu
 */
async function createWaiterCall(tableId) {
    try {
        if (!supabase) throw new Error('Supabase istemcisi başlatılmadı');
        if (!tableId) throw new Error('Masa ID'si eksik');
        
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
        
        return { success: true, data };
    } catch (error) {
        console.error('Çağrı oluşturma hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Çağrıyı yanıtla
 * @param {string} callId - Çağrı ID'si
 * @returns {Promise} - İşlem sonucu
 */
async function acknowledgeCall(callId) {
    try {
        if (!supabase) throw new Error('Supabase istemcisi başlatılmadı');
        if (!callId) throw new Error('Çağrı ID'si eksik');
        
        // Çağrıyı yanıtla
        const { data, error } = await supabase
            .from('calls')
            .update({
                status: 'acknowledged',
                acknowledged_at: new Date().toISOString()
            })
            .eq('id', callId)
            .select()
            .single();
            
        if (error) throw error;
        
        return { success: true, data };
    } catch (error) {
        console.error('Çağrı yanıtlama hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Çağrıyı tamamlandı olarak işaretle
 * @param {string} callId - Çağrı ID'si
 * @returns {Promise} - İşlem sonucu
 */
async function completeCall(callId) {
    try {
        if (!supabase) throw new Error('Supabase istemcisi başlatılmadı');
        if (!callId) throw new Error('Çağrı ID'si eksik');
        
        // Çağrıyı tamamla
        const { data, error } = await supabase
            .from('calls')
            .update({
                status: 'done'
            })
            .eq('id', callId);
            
        if (error) throw error;
        
        return { success: true };
    } catch (error) {
        console.error('Çağrı tamamlama hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Belirli bir restoranın aktif çağrılarını al
 * @param {string} restaurantId - Restoran ID'si
 * @returns {Promise} - Çağrı listesi
 */
async function getActiveCalls(restaurantId) {
    try {
        if (!supabase) throw new Error('Supabase istemcisi başlatılmadı');
        if (!restaurantId) throw new Error('Restoran ID'si eksik');
        
        // Önce restoran masalarını al
        const { data: tables, error: tablesError } = await supabase
            .from('tables')
            .select('id')
            .eq('restaurant_id', restaurantId);
            
        if (tablesError) throw tablesError;
        
        // Masa ID listesi
        const tableIds = tables.map(table => table.id);
        
        if (tableIds.length === 0) {
            return { success: true, data: [] };
        }
        
        // Bu masalara ait aktif çağrıları al
        const { data: calls, error: callsError } = await supabase
            .from('calls')
            .select(`
                id,
                status,
                created_at,
                acknowledged_at,
                table_id,
                tables:table_id (
                    id,
                    number,
                    restaurant_id
                )
            `)
            .in('table_id', tableIds)
            .in('status', ['requested', 'acknowledged'])
            .order('created_at', { ascending: false });
            
        if (callsError) throw callsError;
        
        return { success: true, data: calls };
    } catch (error) {
        console.error('Aktif çağrıları alma hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Restoran bilgilerini al
 * @param {string} restaurantId - Restoran ID'si
 * @returns {Promise} - Restoran bilgileri
 */
async function getRestaurantInfo(restaurantId) {
    try {
        if (!supabase) throw new Error('Supabase istemcisi başlatılmadı');
        if (!restaurantId) throw new Error('Restoran ID'si eksik');
        
        // Restoran bilgilerini al
        const { data, error } = await supabase
            .from('restaurants')
            .select('id, name, plan')
            .eq('id', restaurantId)
            .single();
            
        if (error) throw error;
        
        return { success: true, data };
    } catch (error) {
        console.error('Restoran bilgisi alma hatası:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Masa bilgilerini al
 * @param {string} tableId - Masa ID'si
 * @returns {Promise} - Masa bilgileri
 */
async function getTableInfo(tableId) {
    try {
        if (!supabase) throw new Error('Supabase istemcisi başlatılmadı');
        if (!tableId) throw new Error('Masa ID'si eksik');
        
        // Masa bilgilerini al
        const { data, error } = await supabase
            .from('tables')
            .select(`
                id,
                number,
                restaurant_id,
                restaurants:restaurant_id (
                    id,
                    name
                )
            `)
            .eq('id', tableId)
            .single();
            
        if (error) throw error;
        
        return { success: true, data };
    } catch (error) {
        console.error('Masa bilgisi alma hatası:', error);
        return { success: false, error: error.message };
    }
}

// Fonksiyonları dışa aktar
if (typeof window !== 'undefined') {
    window.waiterCallHandler = {
        createWaiterCall,
        acknowledgeCall,
        completeCall,
        getActiveCalls,
        getRestaurantInfo,
        getTableInfo
    };
}

// Node.js ortamında kullanım için
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        createWaiterCall,
        acknowledgeCall,
        completeCall,
        getActiveCalls,
        getRestaurantInfo,
        getTableInfo
    };
} 