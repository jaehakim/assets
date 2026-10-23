-- CR-A14: 컴플라이언스 탐지(lower(name) LIKE '%…%')가 인덱스를 타도록 trigram GIN 인덱스 추가
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_asset_software_name_trgm ON asset_software USING gin (lower(name) gin_trgm_ops);
