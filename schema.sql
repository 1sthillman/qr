-- Restoran tablosu
CREATE TABLE restaurants (
  id TEXT PRIMARY KEY, -- ABC123 gibi kısa kodlar
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free', -- free/pro
  plan_type VARCHAR(20) DEFAULT 'trial' NOT NULL,
  plan_expiry_date TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 days') NOT NULL,
  max_tables INTEGER DEFAULT 10 NOT NULL,
  is_active BOOLEAN DEFAULT TRUE NOT NULL
);

-- Masa tablosu
CREATE TABLE tables (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id TEXT REFERENCES restaurants(id),
  number INT NOT NULL, -- Masa No: 1,2,3...
  UNIQUE(restaurant_id, number)
);

-- Çağrı tablosu
CREATE TABLE calls (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  table_id UUID REFERENCES tables(id),
  status TEXT CHECK(status IN ('requested', 'acknowledged')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ
);

-- Row Level Security (RLS) politikaları
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Restoran yöneticileri için politikalar
CREATE POLICY restaurant_owner_policy ON restaurants
  FOR ALL USING (auth.uid()::text = id);

-- Masa politikaları
CREATE POLICY tables_restaurant_policy ON tables
  FOR ALL USING (restaurant_id IN (
    SELECT id FROM restaurants WHERE auth.uid()::text = id
  ));

-- Çağrı politikaları
CREATE POLICY calls_restaurant_policy ON calls
  FOR ALL USING (
    table_id IN (
      SELECT id FROM tables 
      WHERE restaurant_id IN (
        SELECT id FROM restaurants WHERE auth.uid()::text = id
      )
    )
  );

-- Realtime özelliğini etkinleştir
ALTER PUBLICATION supabase_realtime ADD TABLE calls;

-- Yardımcı fonksiyonlar
CREATE OR REPLACE FUNCTION set_current_restaurant(restaurant_id TEXT)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('app.current_restaurant_id', restaurant_id, FALSE);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Abonelik planları için tablo oluşturma
CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    max_tables INTEGER NOT NULL,
    price_monthly DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Abonelik geçmişi için tablo oluşturma
CREATE TABLE IF NOT EXISTS subscription_history (
    id SERIAL PRIMARY KEY,
    restaurant_id VARCHAR(50) REFERENCES restaurants(id) ON DELETE CASCADE,
    plan_id INTEGER REFERENCES subscription_plans(id),
    payment_id VARCHAR(100),
    payment_amount DECIMAL(10, 2) NOT NULL,
    payment_date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    status VARCHAR(20) DEFAULT 'active' NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Temel abonelik planlarını ekleme
INSERT INTO subscription_plans (name, description, max_tables, price_monthly) VALUES
('Küçük', '10 masa kapasiteli paket', 10, 250.00),
('Orta', '20 masa kapasiteli paket', 20, 450.00),
('Büyük', '50 masa kapasiteli paket', 50, 800.00),
('Kurumsal', '100 masa kapasiteli paket', 100, 1500.00);

-- Abonelik durumunu kontrol eden fonksiyon
CREATE OR REPLACE FUNCTION check_subscription_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Plan süresi dolmuş mu kontrol et
    IF NEW.plan_expiry_date < NOW() AND NEW.plan_type != 'paid' THEN
        NEW.is_active := FALSE;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Abonelik durumu için trigger
CREATE TRIGGER check_restaurant_subscription
BEFORE UPDATE ON restaurants
FOR EACH ROW
EXECUTE FUNCTION check_subscription_status();

-- Masa sayısı kontrolü için fonksiyon
CREATE OR REPLACE FUNCTION check_table_limit()
RETURNS TRIGGER AS $$
DECLARE
    table_count INTEGER;
BEGIN
    -- Restoran için mevcut masa sayısını kontrol et
    SELECT COUNT(*) INTO table_count FROM tables WHERE restaurant_id = NEW.restaurant_id;
    
    -- Restoranın plan limitini kontrol et
    IF table_count >= (SELECT max_tables FROM restaurants WHERE id = NEW.restaurant_id) THEN
        RAISE EXCEPTION 'Masa sayısı limitine ulaşıldı. Lütfen planınızı yükseltin.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Masa sayısı limiti için trigger
CREATE TRIGGER check_restaurant_table_limit
BEFORE INSERT ON tables
FOR EACH ROW
EXECUTE FUNCTION check_table_limit(); 