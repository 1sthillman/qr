-- Restoran tablosu
CREATE TABLE restaurants (
  id TEXT PRIMARY KEY, -- ABC123 gibi kısa kodlar
  name TEXT NOT NULL,
  plan TEXT DEFAULT 'free' -- free/pro
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