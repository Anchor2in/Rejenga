CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'technician', 'donor', 'recipient')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  area TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  sent_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_models (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  model_name TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (brand, model_name)
);

CREATE TABLE IF NOT EXISTS part_types (
  id TEXT PRIMARY KEY,
  part_name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS compatibility_rules (
  id TEXT PRIMARY KEY,
  donor_model_id TEXT NOT NULL REFERENCES device_models(id),
  recipient_model_id TEXT NOT NULL REFERENCES device_models(id),
  part_type_id TEXT NOT NULL REFERENCES part_types(id),
  source TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  UNIQUE (donor_model_id, recipient_model_id, part_type_id)
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id),
  mime_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  image_data BYTEA NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classifications (
  id TEXT PRIMARY KEY,
  image_id TEXT NOT NULL REFERENCES images(id),
  status TEXT NOT NULL CHECK (status IN ('classified', 'unconfigured', 'failed')),
  prediction_type TEXT CHECK (prediction_type IS NULL OR prediction_type IN ('device_model', 'visible_damage')),
  predicted_class TEXT,
  confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS device_listings (
  id TEXT PRIMARY KEY,
  donor_id TEXT NOT NULL REFERENCES users(id),
  model_id TEXT NOT NULL REFERENCES device_models(id),
  image_id TEXT REFERENCES images(id),
  description TEXT NOT NULL,
  area TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed', 'ended', 'moderated')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS listing_parts (
  id TEXT PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES device_listings(id),
  part_type_id TEXT NOT NULL REFERENCES part_types(id),
  donor_condition TEXT NOT NULL,
  safety_status TEXT NOT NULL DEFAULT 'unverified' CHECK (safety_status IN ('unverified', 'cleared', 'rejected', 'unsafe')),
  availability TEXT NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'reserved', 'given', 'removed', 'blocked')),
  created_at TEXT NOT NULL,
  UNIQUE (listing_id, part_type_id)
);

CREATE TABLE IF NOT EXISTS repair_requests (
  id TEXT PRIMARY KEY,
  recipient_id TEXT NOT NULL REFERENCES users(id),
  model_id TEXT NOT NULL REFERENCES device_models(id),
  part_type_id TEXT NOT NULL REFERENCES part_types(id),
  description TEXT NOT NULL,
  area TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'filled', 'cancelled')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  listing_part_id TEXT NOT NULL REFERENCES listing_parts(id),
  request_id TEXT NOT NULL REFERENCES repair_requests(id),
  rule_id TEXT NOT NULL REFERENCES compatibility_rules(id),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'accepted', 'rejected', 'unsafe', 'completed', 'declined', 'expired')),
  outcome TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (listing_part_id, request_id)
);

CREATE TABLE IF NOT EXISTS inspections (
  id TEXT PRIMARY KEY,
  match_id TEXT NOT NULL UNIQUE REFERENCES matches(id),
  technician_id TEXT NOT NULL REFERENCES users(id),
  observed_condition TEXT NOT NULL,
  fit TEXT NOT NULL CHECK (fit IN ('fits', 'does_not_fit', 'uncertain')),
  decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected', 'unsafe')),
  notes TEXT NOT NULL DEFAULT '',
  inspected_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS part_safety_checks (
  id TEXT PRIMARY KEY,
  listing_part_id TEXT NOT NULL REFERENCES listing_parts(id),
  technician_id TEXT NOT NULL REFERENCES users(id),
  observed_condition TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('cleared', 'rejected', 'unsafe')),
  notes TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON device_listings(status);
CREATE INDEX IF NOT EXISTS idx_listing_parts_availability ON listing_parts(availability, safety_status);
CREATE INDEX IF NOT EXISTS idx_requests_status ON repair_requests(status);
CREATE INDEX IF NOT EXISTS idx_matches_request ON matches(request_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);
