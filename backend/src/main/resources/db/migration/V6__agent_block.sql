-- FR-016: 분실·유출 PC의 Agent 차단(장치 토큰 무효화·재등록 거부). 해제하면 기존 토큰으로 다시 통신한다.
ALTER TABLE agent ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE agent ADD COLUMN IF NOT EXISTS blocked_reason VARCHAR(500);
ALTER TABLE agent ADD COLUMN IF NOT EXISTS blocked_by VARCHAR(255);
-- 주변기기·USB 현황 화면 조회용
CREATE INDEX IF NOT EXISTS idx_asset_usb_device_category_arrival ON asset_usb_device(category, last_arrival_at DESC);
CREATE INDEX IF NOT EXISTS idx_asset_peripheral_type ON asset_peripheral(device_type);
