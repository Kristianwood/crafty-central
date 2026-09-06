-- ============================================================
-- Crafty Central — MySQL schema
--
-- Replaces the Firestore document store. Two shapes needed care
-- on the way across:
--
--   * A job's crew and menu can be overridden per shoot day
--     (copy-on-write from the job default). Rows with a NULL
--     shoot_date are the job default; rows with a date belong to
--     that day. Because an override can legitimately be EMPTY,
--     job_days carries explicit has_crew_override /
--     has_menu_override flags rather than inferring from row
--     count.
--
--   * Read state (which chats and notifications you have seen)
--     used to be per-device localStorage. With real accounts it
--     is per-person, in the database.
--
-- Run with: npm run db:migrate
-- ============================================================

CREATE TABLE IF NOT EXISTS people (
  id            VARCHAR(40)  NOT NULL PRIMARY KEY,
  name          VARCHAR(160) NOT NULL,
  role          ENUM('admin','moderator','crew') NOT NULL DEFAULT 'crew',
  position      VARCHAR(160) NOT NULL DEFAULT '',
  phone         VARCHAR(60)  NOT NULL DEFAULT '',
  email         VARCHAR(190) NOT NULL DEFAULT '',
  tags          JSON         NOT NULL,
  dietary       JSON         NOT NULL,
  -- NULL until the person signs up; directory entries an admin
  -- added by hand sit here with no account until then.
  password_hash VARCHAR(255) NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_people_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sessions (
  id         CHAR(64)    NOT NULL PRIMARY KEY,
  person_id  VARCHAR(40) NOT NULL,
  created_at DATETIME    NOT NULL,
  expires_at DATETIME    NOT NULL,
  user_agent VARCHAR(255) NOT NULL DEFAULT '',
  CONSTRAINT fk_sessions_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  KEY idx_sessions_person (person_id),
  KEY idx_sessions_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS companies (
  id              VARCHAR(40)  NOT NULL PRIMARY KEY,
  name            VARCHAR(190) NOT NULL,
  billing_address TEXT         NOT NULL,
  contact_name    VARCHAR(160) NOT NULL DEFAULT '',
  email           VARCHAR(190) NOT NULL DEFAULT '',
  phone           VARCHAR(60)  NOT NULL DEFAULT '',
  KEY idx_companies_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS jobs (
  id                 VARCHAR(40)  NOT NULL PRIMARY KEY,
  production_name    VARCHAR(255) NOT NULL,
  production_company VARCHAR(190) NOT NULL DEFAULT '',
  agency             VARCHAR(190) NOT NULL DEFAULT '',
  pm                 VARCHAR(160) NOT NULL DEFAULT '',
  producers          VARCHAR(255) NOT NULL DEFAULT '',
  headcount          INT          NOT NULL DEFAULT 0,
  location           VARCHAR(255) NOT NULL DEFAULT '',
  call_time          VARCHAR(5)   NOT NULL DEFAULT '',
  wrap_time          VARCHAR(5)   NOT NULL DEFAULT '',
  status             ENUM('estimate','confirmed','wrapped','invoiced') NOT NULL DEFAULT 'estimate',
  notes              TEXT         NOT NULL,
  rate_per_head      DECIMAL(10,2) NULL,
  rate_truck_day     DECIMAL(10,2) NULL,
  is_sample          TINYINT(1)   NOT NULL DEFAULT 0,
  created_at         DATE         NOT NULL,
  KEY idx_jobs_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per shoot day, in order. The override columns are the
-- old dayInfo: NULL means "fall back to the job-level value".
CREATE TABLE IF NOT EXISTS job_days (
  job_id             VARCHAR(40) NOT NULL,
  shoot_date         DATE        NOT NULL,
  position           INT         NOT NULL,
  call_time          VARCHAR(5)  NULL,
  wrap_time          VARCHAR(5)  NULL,
  headcount          INT         NULL,
  location           VARCHAR(255) NULL,
  notes              TEXT        NULL,
  has_crew_override  TINYINT(1)  NOT NULL DEFAULT 0,
  has_menu_override  TINYINT(1)  NOT NULL DEFAULT 0,
  PRIMARY KEY (job_id, shoot_date),
  CONSTRAINT fk_job_days_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  KEY idx_job_days_date (shoot_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- shoot_date NULL = the job's default crew; a date = that day only.
CREATE TABLE IF NOT EXISTS job_crew (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job_id     VARCHAR(40) NOT NULL,
  shoot_date DATE        NULL,
  person_id  VARCHAR(40) NOT NULL,
  role       VARCHAR(40) NOT NULL,
  position   INT         NOT NULL DEFAULT 0,
  CONSTRAINT fk_job_crew_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_job_crew_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  KEY idx_job_crew_scope (job_id, shoot_date, position),
  KEY idx_job_crew_person (person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- shoot_date NULL = the job's default menu; a date = that day only.
CREATE TABLE IF NOT EXISTS job_menu_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job_id     VARCHAR(40)  NOT NULL,
  shoot_date DATE         NULL,
  position   INT          NOT NULL DEFAULT 0,
  item       VARCHAR(255) NOT NULL,
  CONSTRAINT fk_job_menu_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  KEY idx_job_menu_scope (job_id, shoot_date, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menus (
  id   VARCHAR(40)  NOT NULL PRIMARY KEY,
  name VARCHAR(190) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS menu_items (
  id       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  menu_id  VARCHAR(40)  NOT NULL,
  position INT          NOT NULL DEFAULT 0,
  item     VARCHAR(255) NOT NULL,
  CONSTRAINT fk_menu_items_menu FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
  KEY idx_menu_items_menu (menu_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Production-side people we feed (not our staff).
CREATE TABLE IF NOT EXISTS set_crew (
  id       VARCHAR(40)  NOT NULL PRIMARY KEY,
  name     VARCHAR(160) NOT NULL,
  position VARCHAR(160) NOT NULL DEFAULT '',
  dietary  JSON         NOT NULL,
  notes    TEXT         NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inquiries (
  id         VARCHAR(40)  NOT NULL PRIMARY KEY,
  company    VARCHAR(190) NOT NULL,
  pm         VARCHAR(160) NOT NULL DEFAULT '',
  email      VARCHAR(190) NOT NULL DEFAULT '',
  phone      VARCHAR(60)  NOT NULL DEFAULT '',
  int_ext    VARCHAR(20)  NOT NULL DEFAULT '',
  day_night  VARCHAR(20)  NOT NULL DEFAULT '',
  headcount  INT          NOT NULL DEFAULT 0,
  notes      TEXT         NOT NULL,
  status     ENUM('new','converted','dismissed') NOT NULL DEFAULT 'new',
  created_at DATETIME     NOT NULL,
  KEY idx_inquiries_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inquiry_days (
  inquiry_id VARCHAR(40) NOT NULL,
  shoot_date DATE        NOT NULL,
  PRIMARY KEY (inquiry_id, shoot_date),
  CONSTRAINT fk_inquiry_days FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id        VARCHAR(40) NOT NULL PRIMARY KEY,
  job_id    VARCHAR(40) NOT NULL,
  number    VARCHAR(40) NOT NULL,
  issued_on DATE        NOT NULL,
  due_on    DATE        NOT NULL,
  status    ENUM('draft','sent','paid') NOT NULL DEFAULT 'draft',
  tax_rate  DECIMAL(5,4) NOT NULL DEFAULT 0.1300,
  CONSTRAINT fk_invoices_job FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
  KEY idx_invoices_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS time_off (
  id         VARCHAR(40) NOT NULL PRIMARY KEY,
  person_id  VARCHAR(40) NOT NULL,
  start_date DATE        NOT NULL,
  end_date   DATE        NOT NULL,
  reason     VARCHAR(255) NOT NULL DEFAULT '',
  status     ENUM('pending','approved','denied') NOT NULL DEFAULT 'pending',
  created_at DATE        NOT NULL,
  CONSTRAINT fk_time_off_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE,
  KEY idx_time_off_person (person_id),
  KEY idx_time_off_range (start_date, end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- channel is either 'company' or 'dm:<personA>:<personB>' with the
-- two ids sorted, exactly as before.
CREATE TABLE IF NOT EXISTS messages (
  id         VARCHAR(40)  NOT NULL PRIMARY KEY,
  channel    VARCHAR(120) NOT NULL,
  from_id    VARCHAR(40)  NOT NULL,
  text       TEXT         NOT NULL,
  sent_at    BIGINT       NOT NULL,
  deliver_at BIGINT       NOT NULL,
  CONSTRAINT fk_messages_person FOREIGN KEY (from_id) REFERENCES people(id) ON DELETE CASCADE,
  KEY idx_messages_channel (channel, sent_at),
  KEY idx_messages_deliver (deliver_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id       VARCHAR(40)  NOT NULL PRIMARY KEY,
  audience VARCHAR(60)  NOT NULL,
  text     VARCHAR(500) NOT NULL,
  icon     VARCHAR(40)  NOT NULL DEFAULT 'bell',
  at       BIGINT       NOT NULL,
  KEY idx_notifications_at (at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_reads (
  notification_id VARCHAR(40) NOT NULL,
  person_id       VARCHAR(40) NOT NULL,
  PRIMARY KEY (notification_id, person_id),
  CONSTRAINT fk_nr_notification FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
  CONSTRAINT fk_nr_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_reads (
  person_id    VARCHAR(40)  NOT NULL,
  channel      VARCHAR(120) NOT NULL,
  last_read_at BIGINT       NOT NULL,
  PRIMARY KEY (person_id, channel),
  CONSTRAINT fk_chat_reads_person FOREIGN KEY (person_id) REFERENCES people(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Single row, id = 1. The old meta/settings document.
CREATE TABLE IF NOT EXISTS settings (
  id               TINYINT      NOT NULL PRIMARY KEY DEFAULT 1,
  quiet_start      INT          NOT NULL DEFAULT 7,
  quiet_end        INT          NOT NULL DEFAULT 21,
  per_head_default DECIMAL(10,2) NOT NULL DEFAULT 33.00,
  truck_day_default DECIMAL(10,2) NOT NULL DEFAULT 850.00,
  CONSTRAINT chk_settings_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO settings (id) VALUES (1);
