-- HaulDesk: in-house transport management system
-- Schema for MySQL 8 / MariaDB 10.6+
-- All company names, people and data are fictitious.

DROP DATABASE IF EXISTS hauldesk;
CREATE DATABASE hauldesk CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hauldesk;

-- Sites belong to one client, Tsela Group, split into divisions with different needs
CREATE TABLE sites (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(10)  NOT NULL UNIQUE,
  name        VARCHAR(80)  NOT NULL,
  site_type   ENUM('mine','power_station','rail_siding','harbour') NOT NULL,
  division    ENUM('Tsela Mining','Tsela Power','Tsela Rail & Port') NOT NULL,
  lat         DECIMAL(9,6) NOT NULL,
  lng         DECIMAL(9,6) NOT NULL
);

-- Transport suppliers (hauliers) contracted to move coal
CREATE TABLE hauliers (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(80)  NOT NULL,
  contact_name  VARCHAR(80)  NOT NULL,
  phone         VARCHAR(20)  NOT NULL,
  email         VARCHAR(120) NOT NULL
);

CREATE TABLE drivers (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  full_name       VARCHAR(80) NOT NULL,
  haulier_id      INT NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  licence_no      VARCHAR(20) NOT NULL,
  licence_expiry  DATE NOT NULL,
  prdp_expiry     DATE NOT NULL,          -- professional driving permit
  active          TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (haulier_id) REFERENCES hauliers(id)
);

-- Each truck reports through one of several tracking providers;
-- HaulDesk brings them together on one map.
CREATE TABLE vehicles (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  registration        VARCHAR(15) NOT NULL UNIQUE,
  haulier_id          INT NOT NULL,
  tracker_provider    VARCHAR(30) NOT NULL,
  capacity_t          DECIMAL(5,1) NOT NULL,
  licence_disc_expiry DATE NOT NULL,
  home_site_id        INT NOT NULL,
  active              TINYINT(1) NOT NULL DEFAULT 1,
  FOREIGN KEY (haulier_id)   REFERENCES hauliers(id),
  FOREIGN KEY (home_site_id) REFERENCES sites(id)
);

CREATE TABLE users (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  username       VARCHAR(40)  NOT NULL UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,
  full_name      VARCHAR(80)  NOT NULL,
  role           ENUM('coordinator','client','supplier','driver') NOT NULL,
  division       ENUM('Tsela Mining','Tsela Power','Tsela Rail & Port') NULL,  -- client users
  haulier_id     INT NULL,                                                   -- supplier users
  driver_id      INT NULL,                                                   -- driver users
  FOREIGN KEY (haulier_id) REFERENCES hauliers(id),
  FOREIGN KEY (driver_id)  REFERENCES drivers(id)
);

-- A load is one truck trip from a mine to a delivery point
CREATE TABLE loads (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  load_no             VARCHAR(20) NOT NULL UNIQUE,
  origin_site_id      INT NOT NULL,
  destination_site_id INT NOT NULL,
  haulier_id          INT NOT NULL,
  vehicle_id          INT NULL,
  driver_id           INT NULL,
  product             ENUM('RoM coal','Washed coal','Duff coal') NOT NULL,
  planned_tonnes      DECIMAL(6,2) NOT NULL,
  planned_date        DATE NOT NULL,
  status              ENUM('planned','loading','in_transit','delivered','cancelled') NOT NULL DEFAULT 'planned',
  loaded_at           DATETIME NULL,
  departed_at         DATETIME NULL,
  delivered_at        DATETIME NULL,
  notes               VARCHAR(255) NULL,
  FOREIGN KEY (origin_site_id)      REFERENCES sites(id),
  FOREIGN KEY (destination_site_id) REFERENCES sites(id),
  FOREIGN KEY (haulier_id)          REFERENCES hauliers(id),
  FOREIGN KEY (vehicle_id)          REFERENCES vehicles(id),
  FOREIGN KEY (driver_id)           REFERENCES drivers(id),
  INDEX idx_loads_date (planned_date),
  INDEX idx_loads_status (status)
);

-- Weighbridge tickets: weighed out at the mine, weighed in at the destination
CREATE TABLE weighbridge_tickets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  ticket_no   VARCHAR(20) NOT NULL UNIQUE,
  load_id     INT NOT NULL,
  site_id     INT NOT NULL,
  direction   ENUM('out','in') NOT NULL,
  gross_t     DECIMAL(6,2) NOT NULL,
  tare_t      DECIMAL(6,2) NOT NULL,
  weighed_at  DATETIME NOT NULL,
  FOREIGN KEY (load_id) REFERENCES loads(id),
  FOREIGN KEY (site_id) REFERENCES sites(id),
  UNIQUE KEY uq_ticket_load_dir (load_id, direction)
);

-- Daily stockpile readings per site
CREATE TABLE stockpile_readings (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  site_id       INT NOT NULL,
  product       ENUM('RoM coal','Washed coal','Duff coal') NOT NULL,
  reading_date  DATE NOT NULL,
  tonnes        DECIMAL(10,1) NOT NULL,
  FOREIGN KEY (site_id) REFERENCES sites(id),
  UNIQUE KEY uq_reading (site_id, product, reading_date)
);

-- Document register: where each record is kept and how long it must be retained
CREATE TABLE documents (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  doc_no         VARCHAR(20)  NOT NULL UNIQUE,
  title          VARCHAR(140) NOT NULL,
  category       ENUM('Delivery note','Weighbridge ticket','Permit','Contract','Inspection report','Invoice') NOT NULL,
  load_id        INT NULL,
  site_id        INT NULL,
  haulier_id     INT NULL,
  storage_ref    VARCHAR(40) NOT NULL,   -- archive box or folder reference
  created_on     DATE NOT NULL,
  retain_until   DATE NOT NULL,
  FOREIGN KEY (load_id)    REFERENCES loads(id),
  FOREIGN KEY (site_id)    REFERENCES sites(id),
  FOREIGN KEY (haulier_id) REFERENCES hauliers(id)
);

-- Operational issues raised by coordinators, clients, suppliers or drivers
CREATE TABLE issues (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  ref           VARCHAR(20)  NOT NULL UNIQUE,
  title         VARCHAR(140) NOT NULL,
  category      ENUM('Breakdown','Delay','Weighbridge','Tracking offline','Site access','Safety','Other') NOT NULL,
  priority      ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  status        ENUM('open','in_progress','resolved') NOT NULL DEFAULT 'open',
  load_id       INT NULL,
  vehicle_id    INT NULL,
  reported_by   INT NOT NULL,
  description   TEXT NULL,
  resolution    TEXT NULL,
  created_at    DATETIME NOT NULL,
  resolved_at   DATETIME NULL,
  FOREIGN KEY (load_id)     REFERENCES loads(id),
  FOREIGN KEY (vehicle_id)  REFERENCES vehicles(id),
  FOREIGN KEY (reported_by) REFERENCES users(id)
);
