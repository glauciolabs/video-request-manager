-- Initial PostgreSQL schema for video-request-manager.
-- You can evolve this later with Flyway/Liquibase/Prisma migrations.

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(32) NOT NULL CHECK (role IN ('client', 'admin')),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  user_id UUID,
  requester_name VARCHAR(120),
  requester_email VARCHAR(255),
  request_ip VARCHAR(128),
  request_type VARCHAR(32) CHECK (request_type IN ('new_video', 'add_photos')),
  one_drive_folder VARCHAR(160) UNIQUE,
  transition VARCHAR(32) CHECK (transition IN ('default_3s', '4s', '5s', '6s', 'custom')),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  observations TEXT,
  priority VARCHAR(32) NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'critical', 'normal', 'fast', 'urgent', 'weekend')),
  status VARCHAR(64) NOT NULL CHECK (status IN ('new', 'triage', 'in_production', 'processing', 'done', 'cancelled')),
  due_date TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE IF EXISTS orders
  ADD COLUMN IF NOT EXISTS request_ip VARCHAR(128);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  order_id UUID,
  channel VARCHAR(32) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  payload JSONB,
  status VARCHAR(32) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logs (
  id UUID PRIMARY KEY,
  service_name VARCHAR(64) NOT NULL,
  level VARCHAR(16) NOT NULL,
  message TEXT NOT NULL,
  context JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
