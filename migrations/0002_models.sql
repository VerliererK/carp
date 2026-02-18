-- Models
CREATE TABLE models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  enabled INTEGER DEFAULT 1 NOT NULL,
  CHECK (enabled IN (0, 1))
);

-- Model to provider routing mappings
CREATE TABLE model_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  model_id INTEGER NOT NULL,
  provider_id INTEGER NOT NULL,
  model_name TEXT NOT NULL,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
  UNIQUE(model_id, provider_id)
);
