-- ARCHITECTURE NOTE (2026-03-12):
-- Files are stored in Cloudflare R2.
-- File metadata is stored in Cloudflare D1.
-- Do not reintroduce Firestore metadata writes into this upload flow.

CREATE TABLE IF NOT EXISTS file_metadata (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  category TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  project_id TEXT,
  investment_id TEXT,
  contract_id TEXT,
  request_id TEXT,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL UNIQUE,
  file_url TEXT NOT NULL,
  content_type TEXT NOT NULL,
  file_size INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT,
  uploaded_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploaded',
  version INTEGER,
  bucket TEXT
);

CREATE INDEX IF NOT EXISTS idx_file_metadata_entity
  ON file_metadata (entity_type, entity_id, category, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_file_metadata_investment
  ON file_metadata (investment_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_file_metadata_project
  ON file_metadata (project_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_file_metadata_contract
  ON file_metadata (contract_id, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS idx_file_metadata_request
  ON file_metadata (request_id, uploaded_at DESC);
