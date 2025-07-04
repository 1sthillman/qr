# QR Garson Çağırma Sistemi

QR Garson Çağırma Sistemi, restoranların müşterilerine QR kod aracılığıyla garson çağırma imkanı sunan bir web uygulamasıdır. Müşteriler masalarındaki QR kodu tarayarak garson çağırabilir, restoran çalışanları ise anlık bildirimlerle hangi masanın hizmet talep ettiğini görebilir.

## Özellikler

- **QR Kod Oluşturma**: Restoran için özel QR kodları oluşturma
- **Anlık Bildirimler**: Garson çağrılarını anlık olarak görüntüleme
- **Masa Yönetimi**: Masaları ekleme, düzenleme ve silme
- **Ses Bildirimleri**: Yeni çağrılarda sesli uyarı
- **Mobil Uyumlu**: Tüm cihazlarda sorunsuz çalışma
- **Abonelik Sistemi**: 10 günlük ücretsiz deneme ve farklı abonelik planları

## Abonelik Planları

Sistem, 10 günlük ücretsiz deneme süresi sonrasında aşağıdaki abonelik planlarını sunmaktadır:

| Plan | Fiyat (Aylık) | Masa Kapasitesi |
|------|---------------|-----------------|
| Küçük | 250 TL | 10 masa |
| Orta | 450 TL | 20 masa |
| Büyük | 800 TL | 50 masa |
| Kurumsal | 1500 TL | 100 masa |

## Kurulum

1. Repoyu klonlayın:
```bash
git clone https://github.com/kullaniciadi/qr-garson-sistemi.git
```

2. Veritabanı şemasını oluşturun:
```bash
psql -U postgres -d veritabani_adi -f schema.sql
```

3. Gerekli ayarları yapın:
   - Supabase bağlantı bilgilerini güncelleyin
   - Shopier API anahtarlarını güncelleyin

4. Web sunucusuna yükleyin ve kullanmaya başlayın.

## Ödeme Entegrasyonu

Sistem, Shopier ödeme altyapısını kullanmaktadır. Ödeme işlemleri güvenli bir şekilde gerçekleştirilir ve abonelik planları otomatik olarak aktifleştirilir.

### Shopier Ayarları

Shopier panelinden aşağıdaki ayarları yapmanız gerekmektedir:

1. Shopier hesabınızda oturum açın
2. Entegrasyonlar > Modül Yönetimi sayfasına gidin
3. Geri Dönüş URL'si olarak `https://sizin-siteniz.com/callback.html` adresini ekleyin
4. API anahtarınızı ve API gizli anahtarınızı kopyalayın ve uygulamanızda kullanın

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Daha fazla bilgi için `LICENSE` dosyasına bakın. 