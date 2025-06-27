document.addEventListener('DOMContentLoaded', function() {
    console.log('Garson paneli başlatıldı');

    // Supabase bağlantısı - 1sthillman/qr projesine uyumlu
    const SUPABASE_URL = 'https://wihdzkvgttfwsiijxidy.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndpaGR6a3ZndHRmd3NpaWp4aWR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MzA0MjIsImV4cCI6MjA2NjIwNjQyMn0.Cpn6y7ybyLA3uL-bjvsxPKoIw-J7I6eTE5cPGnBjOo4';

    let supabase;
    let restaurantId = '';
    let waiterName = '';
    let callAudio;
    let allTables = []; // Tüm masaların listesi
    let currentPage = 1;
    const tablesPerPage = 20; // Sayfa başına gösterilecek masa sayısı
    let totalPages = 0;
    let searchTerm = '';
    let tableStatuses = {}; // Masa durumlarını saklayacak nesne
    let supabaseChannel = null;
    let activeCallsCount = 0; // Aktif çağrı sayısı
    let callsChannel = null; // Çağrı kanalı

    // Supabase istemcisini başlat
    function initSupabase() {
        try {
            supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('Supabase başlatıldı');
            return true;
        } catch (error) {
            console.error('Supabase başlatma hatası:', error);
            return false;
        }
    }

    // Sayfalar arası geçiş
    const loginPage = document.getElementById('loginPage');
    const dashboardPage = document.getElementById('dashboardPage');
    
    // Toast mesaj gösterme
    function showToast(type, title, message, duration = 3000) {
    const toastContainer = document.getElementById('toastContainer');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        // Toast ikonu
        const icon = document.createElement('div');
        icon.className = 'toast-icon';
        
        if (type === 'success') {
            icon.innerHTML = '<i class="ri-check-line"></i>';
        } else if (type === 'error') {
            icon.innerHTML = '<i class="ri-error-warning-line"></i>';
        }
        
        // Toast içeriği
        const content = document.createElement('div');
        content.className = 'toast-content';
        
        const titleEl = document.createElement('div');
        titleEl.className = 'toast-title';
        titleEl.textContent = title;
        
        const messageEl = document.createElement('div');
        messageEl.className = 'toast-message';
        messageEl.textContent = message;
        
        content.appendChild(titleEl);
        content.appendChild(messageEl);
        
        toast.appendChild(icon);
        toast.appendChild(content);
        
        toastContainer.appendChild(toast);
        
        toast.style.animationName = 'fadein';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }, duration);
    }
    
    // Modal kontrolü
    const callModal = document.getElementById('callModal');
    const modalTableNo = document.getElementById('modalTableNo');
    const modalAckBtn = document.getElementById('modalAckBtn');
    
    function showModal(tableId) {
        if (callModal) {
            modalTableNo.textContent = tableId;
            callModal.classList.remove('hidden');
        }
    }
    
    function hideModal() {
        if (callModal) {
            callModal.classList.add('hidden');
        }
    }
    
    if (modalAckBtn) {
        modalAckBtn.addEventListener('click', function() {
            const tableId = modalTableNo.textContent;
            updateTableStatus(tableId, 'serving');
            hideModal();
            showToast('success', `Masa ${tableId}`, 'Çağrı yanıtlandı');
            
            // 1. Masa durumunu güncelle
            if (supabase) {
                supabase
                    .from('tables')
                    .upsert({
                        restaurant_id: restaurantId,
                        table_id: tableId,
                        status: 'serving',
                        updated_at: new Date().toISOString()
                    })
                    .then(response => {
                        if (response.error) {
                            console.error('Supabase güncelleme hatası:', response.error);
                        } else {
                            console.log(`Masa ${tableId} durumu 'serving' olarak güncellendi`);
                            // Yerel durum nesnesini güncelle
                            tableStatuses[tableId] = 'serving';
                        }
                    });
            }
            
            // 2. Çağrıyı yanıtla (1sthillman/qr projesine uyumlu)
            acknowledgeCall(tableId);
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
                console.error('Masa durumu güncelleme hatası:', updateTableError);
                return;
            }
            
            console.log(`Masa ${tableNumber} durumu 'serving' olarak güncellendi`);
            
            // 2. Çağrıyı bul ve güncelle
            const { data: callData, error: callError } = await supabase
                .from('calls')
                .select('id')
                .eq('table_id', tableData.id)
                .eq('status', 'requested')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
                
            if (callError || !callData) {
                console.error('Aktif çağrı bulunamadı:', callError);
                return;
            }
            
            console.log('Bulunan çağrı ID:', callData.id);
            
            // 3. Çağrıyı yanıtla
            const { error: updateError } = await supabase
                .from('calls')
                .update({
                    status: 'acknowledged',
                    acknowledged_at: new Date().toISOString()
                })
                .eq('id', callData.id);
                
            if (updateError) {
                console.error('Çağrı yanıtlama hatası:', updateError);
            } else {
                console.log(`Masa ${tableNumber} çağrısı yanıtlandı`);
            }
        } catch (err) {
            console.error('Çağrı yanıtlama hatası:', err);
        }
    }
    
    // Masa kartı oluşturma
    function createTableCard(tableId) {
        const tableCard = document.createElement('div');
        tableCard.className = 'table-card';
        tableCard.id = `table-${tableId}`;
        
        // İçerik kısmı
        const cardContent = document.createElement('div');
        cardContent.className = 'card-content';
        
        // Masa numarası
        const tableNumber = document.createElement('div');
        tableNumber.className = 'table-number';
        tableNumber.textContent = tableId;
        
        // Masa durumu
        const tableStatus = document.createElement('div');
        tableStatus.className = 'table-status';
        tableStatus.textContent = 'MASA';
        
        // Durum göstergesi 
        const statusIndicator = document.createElement('div');
        statusIndicator.className = 'status-indicator';
        
        cardContent.appendChild(tableNumber);
        cardContent.appendChild(tableStatus);
        cardContent.appendChild(statusIndicator);
        
        // Dalga bölümü
        const waveSection = document.createElement('div');
        waveSection.className = 'wave-section';
        
        // Dalga animasyonları
        const waveContainer = document.createElement('div');
        waveContainer.className = 'wave-container';
        
        // Üç katmanlı dalga animasyonu
        for (let i = 1; i <= 3; i++) {
            const wave = document.createElement('div');
            wave.className = `wave wave${i}`;
            waveContainer.appendChild(wave);
        }
        
        waveSection.appendChild(waveContainer);
        
        // Kartı birleştir
        tableCard.appendChild(cardContent);
        tableCard.appendChild(waveSection);
        
        // Tıklama olayı
        tableCard.addEventListener('click', function() {
            const currentStatus = tableCard.classList.contains('calling') ? 'calling' : 
                                 tableCard.classList.contains('serving') ? 'serving' : 'idle';
            
            if (currentStatus === 'calling') {
                showModal(tableId);
            } else if (currentStatus === 'serving') {
                updateTableStatus(tableId, 'idle');
                showToast('success', `Masa ${tableId}`, 'İşlem tamamlandı');
                
                // Supabase'e durum güncellemesi gönder
                if (supabase) {
                    supabase
                        .from('tables')
                        .upsert({
                            restaurant_id: restaurantId,
                            table_id: tableId,
                            status: 'idle',
                            updated_at: new Date().toISOString()
                        })
                        .then(response => {
                            if (response.error) {
                                console.error('Supabase güncelleme hatası:', response.error);
                } else {
                                console.log(`Masa ${tableId} durumu 'idle' olarak güncellendi`);
                                // Yerel durum nesnesini güncelle
                                tableStatuses[tableId] = 'idle';
                            }
                        });
                }
            }
        });
        
        // 3D tilt efektini etkinleştir
        setTimeout(() => {
            if (typeof VanillaTilt !== 'undefined') {
                VanillaTilt.init(tableCard, {
                    max: 10,
                    speed: 400,
                    glare: true,
                    "max-glare": 0.2
                });
            }
        }, 100);
        
        // Eğer masa durumu varsa, uygula
        if (tableStatuses[tableId]) {
            updateTableStatus(tableId, tableStatuses[tableId]);
        }
        
        return tableCard;
    }
    
    // Masa durumu güncelleme
    function updateTableStatus(tableId, status) {
        const tableCard = document.getElementById(`table-${tableId}`);
        if (!tableCard) {
            // Eğer masa kartı henüz oluşturulmadıysa, masaları yeniden yükle
            if (!allTables.includes(parseInt(tableId))) {
                allTables.push(parseInt(tableId));
                renderTables();
            }
            return;
        }
        
        const tableStatus = tableCard.querySelector('.table-status');
        
        // Önceki tüm durum sınıflarını temizle
        tableCard.classList.remove('calling', 'serving');
        
        if (status === 'calling') {
            tableCard.classList.add('calling');
            tableStatus.textContent = 'ÇAĞIRIYOR';
        } else if (status === 'serving') {
            tableCard.classList.add('serving');
            tableStatus.textContent = 'SERVİS';
        } else {
            tableStatus.textContent = 'MASA';
        }
        
        // Yerel durum nesnesini güncelle
        tableStatuses[tableId] = status;
    }
    
    // Ses çalma
    function initAudio() {
        callAudio = new Audio('audio/panic.mp3');
        callAudio.preload = 'auto';
        callAudio.volume = 0.7;
    }
    
    function playCallSound() {
        if (callAudio) {
            callAudio.currentTime = 0;
            callAudio.play().catch(err => {
                console.log('Ses çalınamadı: ', err);
            });
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
                
                if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
                    // Masa numarasını al
                    const tableNumber = payload.new.table_id || payload.new.number;
                    const status = payload.new.status || 'idle';
                    
                    console.log(`Masa ${tableNumber} durumu güncellendi: ${status}`);
                    
                    // Yerel durum nesnesini güncelle
                    tableStatuses[tableNumber] = status;
                    
                    // UI'ı güncelle
                    updateTableStatus(tableNumber, status);
                    
                    // Eğer çağrı varsa bildirim göster ve ses çal
                    if (status === 'calling') {
                        activeCallsCount++;
                        showToast('error', `Masa ${tableNumber} çağırıyor`, 'Müşteri servisi bekliyor!');
                        showModal(tableNumber);
                        playCallSound();
                    }
                }
            })
            .subscribe(status => {
                console.log('Supabase realtime table bağlantı durumu:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('Masa değişiklikleri dinleniyor. Filter:', `restaurant_id=eq.${restaurantId}`);
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('Masa kanalı bağlantı hatası!');
                }
            });
            
        // 2. Çağrıları dinle (1sthillman/qr projesine uyumlu)
        console.log('Çağrı kanalı oluşturuluyor...');
        callsChannel = supabase
            .channel('calls-channel')
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'calls'
            }, payload => {
                console.log('Supabase calls INSERT event alındı:', payload);
                
                // Yeni çağrı geldi
                const call = payload.new;
                
                if (!call.table_id) {
                    console.log('Çağrıda table_id bulunamadı:', call);
                    return;
                }
                
                // Masa ID'sini al
                getTableInfo(call.table_id).then(tableInfo => {
                    if (tableInfo && tableInfo.restaurant_id === restaurantId) {
                        console.log(`Yeni çağrı alındı: Masa ${tableInfo.number}`);
                        
                        // Masa durumunu güncelle
                        tableStatuses[tableInfo.number] = 'calling';
                        updateTableStatus(tableInfo.number, 'calling');
                        
                        // Bildirim göster ve ses çal
                        activeCallsCount++;
                        showToast('error', `Masa ${tableInfo.number} çağırıyor`, 'Müşteri servisi bekliyor!');
                        showModal(tableInfo.number);
                        playCallSound();
                    } else {
                        console.log('Bu çağrı bu restorana ait değil veya masa bilgisi alınamadı:', tableInfo);
                    }
                }).catch(err => {
                    console.error('Masa bilgisi alma hatası:', err);
                });
            })
            .subscribe(status => {
                console.log('Supabase realtime calls INSERT bağlantı durumu:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('Çağrı ekleme olayları dinleniyor.');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('Çağrı kanalı bağlantı hatası!');
                }
            });
            
        // 3. Çağrı güncellemelerini dinle
        console.log('Çağrı güncelleme kanalı oluşturuluyor...');
        supabase
            .channel('calls-update-channel')
            .on('postgres_changes', { 
                event: 'UPDATE', 
                schema: 'public', 
                table: 'calls'
            }, payload => {
                console.log('Supabase calls UPDATE event alındı:', payload);
                
                if (payload.new.status === 'acknowledged') {
                    // Çağrı yanıtlandı
                    const call = payload.new;
                    
                    if (!call.table_id) {
                        console.log('Çağrıda table_id bulunamadı:', call);
                        return;
                    }
                    
                    // Masa ID'sini al
                    getTableInfo(call.table_id).then(tableInfo => {
                        if (tableInfo && tableInfo.restaurant_id === restaurantId) {
                            console.log(`Çağrı yanıtlandı: Masa ${tableInfo.number}`);
                            
                            // Masa durumunu güncelle
                            tableStatuses[tableInfo.number] = 'serving';
                            updateTableStatus(tableInfo.number, 'serving');
                        } else {
                            console.log('Bu çağrı bu restorana ait değil veya masa bilgisi alınamadı:', tableInfo);
                        }
                    }).catch(err => {
                        console.error('Masa bilgisi alma hatası:', err);
                    });
                }
            })
            .subscribe(status => {
                console.log('Supabase realtime calls UPDATE bağlantı durumu:', status);
                if (status === 'SUBSCRIBED') {
                    console.log('Çağrı güncelleme olayları dinleniyor.');
                } else if (status === 'CHANNEL_ERROR') {
                    console.error('Çağrı güncelleme kanalı bağlantı hatası!');
                }
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
                    .select('restaurant_id, number')
                    .eq('id', tableId)
                    .single();
                    
                if (error) {
                    console.error('Masa bilgisi alınamadı (UUID):', error);
                    return null;
                }
                
                console.log('Masa bilgisi bulundu (UUID):', data);
                return data;
            } 
            // Sayısal ID ise table_id veya number ile sorgula
            else if (tableId) {
                // Önce table_id ile dene
                const { data: data1, error: error1 } = await supabase
                    .from('tables')
                    .select('restaurant_id, number, id')
                    .eq('table_id', parseInt(tableId))
                    .eq('restaurant_id', restaurantId)
                    .single();
                    
                if (!error1 && data1) {
                    console.log('Masa bilgisi bulundu (table_id):', data1);
                    return data1;
                }
                
                // Sonra number ile dene
                const { data: data2, error: error2 } = await supabase
                    .from('tables')
                    .select('restaurant_id, number, id')
                    .eq('number', parseInt(tableId))
                    .eq('restaurant_id', restaurantId)
                    .single();
                    
                if (error2) {
                    console.error('Masa bilgisi alınamadı (number):', error2);
                    return null;
                }
                
                console.log('Masa bilgisi bulundu (number):', data2);
                return data2;
            }
            
            return null;
        } catch (err) {
            console.error('Masa bilgisi alma hatası:', err);
            return null;
        }
    }
    
    // Sayfalama oluşturma
    function createPagination() {
        const paginationContainer = document.getElementById('pagination');
        if (!paginationContainer) return;
        
        paginationContainer.innerHTML = '';
        
        // Toplam sayfa sayısını hesapla
        totalPages = Math.ceil(getFilteredTables().length / tablesPerPage);
        
        // Önceki sayfa butonu
        const prevButton = document.createElement('button');
        prevButton.className = 'pagination-button';
        prevButton.innerHTML = '<i class="ri-arrow-left-s-line"></i>';
        prevButton.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                renderTables();
            }
        });
        paginationContainer.appendChild(prevButton);
        
        // Sayfa numaraları
        const maxPageButtons = 5; // Gösterilecek maksimum sayfa butonu sayısı
        let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
        let endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
        
        if (endPage - startPage + 1 < maxPageButtons) {
            startPage = Math.max(1, endPage - maxPageButtons + 1);
        }
        
        for (let i = startPage; i <= endPage; i++) {
            const pageButton = document.createElement('button');
            pageButton.className = `pagination-button ${i === currentPage ? 'active' : ''}`;
            pageButton.textContent = i;
            pageButton.addEventListener('click', () => {
                currentPage = i;
                renderTables();
            });
            paginationContainer.appendChild(pageButton);
        }
        
        // Sonraki sayfa butonu
        const nextButton = document.createElement('button');
        nextButton.className = 'pagination-button';
        nextButton.innerHTML = '<i class="ri-arrow-right-s-line"></i>';
        nextButton.addEventListener('click', () => {
            if (currentPage < totalPages) {
                currentPage++;
                renderTables();
            }
        });
        paginationContainer.appendChild(nextButton);
    }
    
    // Arama işlevi
    function setupSearch() {
        const searchInput = document.getElementById('searchInput');
        if (!searchInput) return;
        
        searchInput.addEventListener('input', function(e) {
            searchTerm = e.target.value.trim();
            currentPage = 1; // Arama yapıldığında ilk sayfaya dön
            renderTables();
        });
    }
    
    // Arama filtresine göre masaları filtrele
    function getFilteredTables() {
        if (!searchTerm) return allTables;
        
        return allTables.filter(tableId => {
            return tableId.toString().includes(searchTerm);
        });
    }
    
    // Masaları sayfala ve göster
    function renderTables() {
        const tablesGrid = document.getElementById('tablesGrid');
        if (!tablesGrid) return;
        
        tablesGrid.innerHTML = '';
        
        const filteredTables = getFilteredTables();
        const startIndex = (currentPage - 1) * tablesPerPage;
        const endIndex = Math.min(startIndex + tablesPerPage, filteredTables.length);
        
        for (let i = startIndex; i < endIndex; i++) {
            const tableId = filteredTables[i];
            const tableCard = createTableCard(tableId);
            tablesGrid.appendChild(tableCard);
        }
        
        // Sayfalama güncelle
        createPagination();
        
        // 3D tilt efektlerini yeniden başlat
        setTimeout(() => {
            if (typeof VanillaTilt !== 'undefined') {
                VanillaTilt.init(document.querySelectorAll('.table-card'), {
                    max: 10,
                    speed: 400,
                    glare: true,
                    "max-glare": 0.2
                });
            }
        }, 100);
    }
    
    // Veritabanından masa durumlarını al
    async function fetchTableStatuses() {
        if (!supabase) return;
        
        try {
            const { data, error } = await supabase
                .from('tables')
                .select('table_id, status')
                .eq('restaurant_id', restaurantId);
            
            if (error) {
                console.error('Masa durumları alınamadı:', error);
                return;
            }
            
            // Masa durumlarını yerel nesneye kaydet
            tableStatuses = {};
            if (data && data.length > 0) {
                data.forEach(table => {
                    tableStatuses[table.table_id] = table.status;
                    
                    // Çağrı durumundaki masaları say
                    if (table.status === 'calling') {
                        activeCallsCount++;
                    }
                });
            }
            
            console.log('Masa durumları alındı:', tableStatuses);
            
            // Mevcut masaları güncelle
            Object.keys(tableStatuses).forEach(tableId => {
                updateTableStatus(tableId, tableStatuses[tableId]);
            });
            
            // Aktif çağrı varsa ses çal
            if (activeCallsCount > 0) {
                playCallSound();
            }
            
        } catch (err) {
            console.error('Masa durumları alınırken hata oluştu:', err);
        }
    }
    
    // Demo verilerini yükle
    function loadDemoTables() {
        // 100 masalık bir dizi oluştur
        allTables = Array.from({length: 100}, (_, i) => i + 1);
        
        // Demo için masa durumlarını sıfırla
        tableStatuses = {};
        
        // İlk sayfayı göster
        renderTables();
        
        // Demo modunda hayalet masalar oluşturma
        if (restaurantId === 'demo') {
            // Sadece demo modunda rastgele masaları çağırı durumuna getir
            setTimeout(() => {
                // Hayalet masaları temizle (3, 7, 12 numaralı masalar)
                const ghostTables = [3, 7, 12];
                ghostTables.forEach(tableId => {
                    if (tableStatuses[tableId]) {
                        delete tableStatuses[tableId];
                    }
                });
                
                // Sadece birkaç masa için durum belirle
                updateTableStatus(25, 'serving');
                updateTableStatus(42, 'calling');
                updateTableStatus(68, 'serving');
                updateTableStatus(99, 'calling');
            }, 1500);
        } else {
            // Gerçek modda veritabanından masa durumlarını al
            fetchTableStatuses();
        }
    }
    
    // Giriş işlemi
    document.getElementById('loginBtn')?.addEventListener('click', function() {
        restaurantId = document.getElementById('restaurantIdInput')?.value || 'demo';
        waiterName = document.getElementById('waiterNameInput')?.value || 'Demo Garson';
        
        if (!restaurantId || !waiterName) {
            showToast('error', 'Hata', 'Lütfen tüm alanları doldurun');
            return;
        }
        
        // Demo modu veya Supabase ile giriş
        if (restaurantId === 'demo') {
            loginSuccessful();
        } else {
            const supabaseInitialized = initSupabase();
            if (supabaseInitialized) {
                // Gerçek bir uygulamada burada Supabase ile doğrulama yapılırdı
                loginSuccessful();
                fetchTableStatuses();
                listenForTableChanges();
            } else {
                showToast('error', 'Bağlantı Hatası', 'Sunucuya bağlanılamadı');
            }
        }
    });
    
    // Başarılı giriş
    function loginSuccessful() {
        loginPage.classList.add('hidden');
        dashboardPage.classList.remove('hidden');
        
        showToast('success', 'Hoş Geldiniz', `${waiterName}, sisteme giriş yaptınız`);
        setupSearch();
        loadDemoTables();
        initAudio();
        
        // Demo modu değilse Supabase dinlemeyi başlat
        if (restaurantId !== 'demo' && supabase) {
            fetchTableStatuses();
            listenForTableChanges();
        }
    }
    
    // Çıkış işlemi
    document.getElementById('logoutBtn')?.addEventListener('click', function() {
        // Supabase bağlantısını temizle
        if (supabaseChannel) {
            supabaseChannel.unsubscribe();
            supabaseChannel = null;
        }
        
        if (callsChannel) {
            callsChannel.unsubscribe();
            callsChannel = null;
        }
        
        // Masa durumlarını temizle
        tableStatuses = {};
        
        // Sayfaları değiştir
        dashboardPage.classList.add('hidden');
        loginPage.classList.remove('hidden');
    });

    // Ses testi
    document.getElementById('testSoundBtn')?.addEventListener('click', function() {
        playCallSound();
        showToast('success', 'Ses Testi', 'Çağrı sesi test edildi');
    });
}); 