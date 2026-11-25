-- Agent 0.3.1: 설치·업데이트 전 보안 점검(PRECHECK)과 설치 후 점검(POSTCHECK) 결과 기록.
CREATE TABLE agent_install_report(
  id BIGSERIAL PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agent(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('UPDATE','INSTALL','REPAIR')),
  stage VARCHAR(20) NOT NULL CHECK (stage IN ('PRECHECK','POSTCHECK')),
  result VARCHAR(20) NOT NULL CHECK (result IN ('PASSED','BLOCKED','INSTALLED','ROLLED_BACK','FAILED')),
  from_version VARCHAR(30),
  to_version VARCHAR(30) NOT NULL,
  checks JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary VARCHAR(1000),
  checked_at TIMESTAMPTZ,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  remote_ip VARCHAR(64)
);
CREATE INDEX idx_agent_install_report_agent ON agent_install_report(agent_id, reported_at DESC);
CREATE INDEX idx_agent_install_report_reported ON agent_install_report(reported_at DESC);
