# Shopier Ödeme Entegrasyonu Test Rehberi

Bu rehber, QR Garson Çağırma Sistemi'nin Shopier ödeme entegrasyonunu test etmek için hazırlanmıştır.

## Test Ortamı Ayarları

Shopier entegrasyonunu test etmek için aşağıdaki dosyalarda test modunu etkinleştirdik:

1. **callback.html**: 
   - `DEBUG_MODE = true` - Debug bilgilerini gösterir
   - `TEST_MODE = true` - Shopier'den gerçek yanıt olmadan da test yapabilmenizi sağlar

Bu modlar, geliştirme aşamasında kolaylık sağlamak için eklenmiştir. Canlı ortama geçmeden önce bu modları kapatmanız gerekmektedir.

## Test Adımları

### 1. Shopier Test Sayfasını Kullanma

`shopier-test.html` sayfası, Shopier entegrasyonunu test etmek için özel olarak hazırlanmıştır.

1. `shopier-test.html` sayfasını açın
2. Test parametrelerini doldurun:
   - Restoran ID: Test için herhangi bir değer girebilirsiniz
   - Abonelik Planı: Test etmek istediğiniz planı seçin
   - Müşteri bilgilerini doldurun
3. "Shopier Ödeme Testini Başlat" butonuna tıklayın
4. Shopier ödeme sayfasına yönlendirileceksiniz
5. Ödeme işlemini tamamlayın (test kartı bilgileri aşağıda verilmiştir)
6. İşlem sonucunda callback.html sayfasına yönlendirileceksiniz

### 2. Payment Sayfasını Test Etme

Normal ödeme akışını test etmek için:

1. `payment.html?restaurant_id=TEST123` adresini açın
2. Bir abonelik planı seçin
3. "Ödemeyi Tamamla" butonuna tıklayın
4. Shopier ödeme sayfasına yönlendirileceksiniz
5. Ödeme işlemini tamamlayın
6. İşlem sonucunda callback.html sayfasına yönlendirileceksiniz

### 3. Callback Sayfasını Doğrudan Test Etme

Callback sayfasını test modunda doğrudan test etmek için:

1. `callback.html` sayfasını açın
2. Test modu etkin olduğu için, otomatik olarak başarılı bir ödeme simüle edilecektir
3. Debug bilgilerini sayfanın alt kısmında görebilirsiniz

## Shopier Test Kartı Bilgileri

Shopier test ortamında aşağıdaki kart bilgilerini kullanabilirsiniz:

- **Kart Numarası**: 4111 1111 1111 1111
- **Son Kullanma Tarihi**: Gelecekteki herhangi bir tarih (örn. 12/25)
- **CVV**: 123
- **3D Secure Kodu**: 123456

## Hata Durumlarını Test Etme

Farklı hata durumlarını test etmek için:

1. `callback.html` dosyasında `TEST_MODE = false` yapın
2. URL'e farklı parametreler ekleyerek test edin:
   - Başarısız ödeme: `callback.html?status=failed`
   - Eksik parametreler: `callback.html?status=success` (payment_id ve custom_data olmadan)
   - Geçersiz imza: `callback.html?status=success&payment_id=123&random_nr=456&platform_order_id=789&signature=invalid&custom_data={"restaurant_id":"TEST123","plan_id":"small","plan_tables":10}`

## Canlı Ortama Geçiş

Testler başarıyla tamamlandıktan sonra, canlı ortama geçmek için:

1. `callback.html` dosyasında:
   - `DEBUG_MODE = false` yapın
   - `TEST_MODE = false` yapın

2. Shopier hesabınızdan gerçek API anahtarlarını alın ve aşağıdaki dosyalarda güncelleyin:
   - `payment.html`
   - `shopier-test.html`
   - `callback.html`

3. Shopier panelinden geri dönüş URL'sini ayarlayın:
   - Entegrasyonlar > Modül Yönetimi sayfasında
   - Geri Dönüş URL'si: `https://sizin-siteniz.com/callback.html`

## Sorun Giderme

Eğer entegrasyon sırasında sorunlarla karşılaşırsanız:

1. Debug modunu etkinleştirin (`DEBUG_MODE = true`)
2. Callback sayfasındaki debug bilgilerini kontrol edin
3. Tarayıcı konsolunda hata mesajlarını kontrol edin
4. Shopier'in API dokümantasyonunu kontrol edin

Yaygın hatalar:
- 500 hatası: Shopier'e gönderilen parametreler eksik veya hatalı
- İmza doğrulama hatası: API anahtarları yanlış veya imza oluşturma algoritması hatalı
- Callback URL hatası: Shopier panelinde doğru callback URL'si tanımlanmamış

## Önemli Notlar

- Shopier entegrasyonu için kullanılan API anahtarları güvenli bir şekilde saklanmalıdır
- Canlı ortamda test modları mutlaka kapatılmalıdır
- Ödemeler TL cinsinden yapılmaktadır (currency=0)
- İmza oluşturma algoritması Shopier'in dokümantasyonuna göre güncellenebilir 