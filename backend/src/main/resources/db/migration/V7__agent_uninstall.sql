-- Agent 0.3.0: 승인된 제거. 사용자는 Agent를 임의로 제거할 수 없고(서비스 권한 잠금), 관리자 승인 또는
-- 관리자가 발급한 장치 전용 제거 코드로만 제거된다. 요청·승인·거절·코드 발급·완료를 모두 기록한다.
CREATE TABLE IF NOT EXISTS agent_uninstall_request(
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('REQUESTED','APPROVED','REJECTED','COMPLETED','EXPIRED')),
  source VARCHAR(20) NOT NULL CHECK (source IN ('DEVICE','ADMIN','CODE')),
  reason VARCHAR(500),
  requested_by VARCHAR(255),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by VARCHAR(255),
  decided_at TIMESTAMPTZ,
  decision_note VARCHAR(500),
  expires_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS idx_agent_uninstall_agent ON agent_uninstall_request(agent_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_uninstall_open ON agent_uninstall_request(status) WHERE status IN ('REQUESTED','APPROVED');
ALTER TABLE agent ADD COLUMN IF NOT EXISTS uninstalled_at TIMESTAMPTZ;
