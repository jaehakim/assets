-- Agent 0.2.14: USB 장치(현재 연결 + PC에 기록된 과거 연결). PC에서 기록이 정리돼도 서버에는 누적 보관한다(삭제하지 않음).
CREATE TABLE IF NOT EXISTS asset_usb_device(
  id BIGSERIAL PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  device_id VARCHAR(500) NOT NULL,
  category VARCHAR(20) NOT NULL,
  name VARCHAR(255) NOT NULL,
  manufacturer VARCHAR(255),
  vendor_id VARCHAR(8),
  product_id VARCHAR(8),
  serial_no VARCHAR(255),
  device_class VARCHAR(100),
  service VARCHAR(100),
  present BOOLEAN NOT NULL DEFAULT false,
  first_install_at TIMESTAMPTZ,
  last_arrival_at TIMESTAMPTZ,
  last_removal_at TIMESTAMPTZ,
  first_reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(asset_id, device_id));
CREATE INDEX IF NOT EXISTS idx_asset_usb_device_serial ON asset_usb_device(lower(serial_no)) WHERE serial_no IS NOT NULL;
-- usb_collected_at NULL = USB 목록을 보고한 적 없는 Agent(0.2.13 이하). collection_errors = 최근 인벤토리의 수집 실패 사유.
ALTER TABLE asset ADD COLUMN IF NOT EXISTS usb_collected_at TIMESTAMPTZ;
ALTER TABLE asset ADD COLUMN IF NOT EXISTS collection_errors VARCHAR(2000);
