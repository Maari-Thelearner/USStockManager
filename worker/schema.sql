-- One-row JSON snapshot for a single personal portfolio.
-- The API exposes only this row, and every request requires the shared access key.
CREATE TABLE IF NOT EXISTS portfolio_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO portfolio_state (id, data, updated_at)
VALUES (1, '{}', datetime('now'));
