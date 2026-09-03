CREATE TABLE IF NOT EXISTS scan_runs (
  id INTEGER PRIMARY KEY,
  library_root_id INTEGER NOT NULL REFERENCES library_roots(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,
  processed_files INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_scan_runs_root_started
  ON scan_runs(library_root_id, started_at DESC);
