-- Agent 0.2.13: PC에 연결된 모니터·키보드·마우스. first_seen_at은 같은 장치가 계속 연결돼 있는 동안 유지된다.
CREATE TABLE IF NOT EXISTS asset_peripheral(
  id BIGSERIAL PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  device_type VARCHAR(20) NOT NULL CHECK (device_type IN ('MONITOR','KEYBOARD','MOUSE')),
  name VARCHAR(255) NOT NULL,
  manufacturer VARCHAR(255),
  model VARCHAR(100),
  serial_no VARCHAR(100),
  connection VARCHAR(50),
  vendor_id VARCHAR(8),
  product_id VARCHAR(8),
  manufacture_year INTEGER,
  size_inches NUMERIC(4,1),
  device_id VARCHAR(500),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_asset_peripheral_asset ON asset_peripheral(asset_id);
CREATE INDEX IF NOT EXISTS idx_asset_peripheral_serial ON asset_peripheral(lower(serial_no)) WHERE serial_no IS NOT NULL;
-- NULL = 아직 주변기기를 보고한 적 없는 Agent(0.2.12 이하). 0건 보고와 구분한다.
ALTER TABLE asset ADD COLUMN IF NOT EXISTS peripherals_collected_at TIMESTAMPTZ;
