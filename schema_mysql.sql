-- =====================================================================
-- ApexMoto POS — MySQL Database Schema for XAMPP / MariaDB
-- 
-- How to import into XAMPP:
-- 1. Open XAMPP Control Panel and start Apache & MySQL.
-- 2. Open http://localhost/phpmyadmin in your browser.
-- 3. Click "Databases" -> Create database named: apexmoto_pos (utf8mb4_general_ci).
-- 4. Select `apexmoto_pos` -> Click "Import" tab -> Choose this file -> Click "Go".
-- =====================================================================

CREATE DATABASE IF NOT EXISTS `apexmoto_pos` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `apexmoto_pos`;

-- =====================================================================
-- TABLE: parts
-- Stores all motorcycle parts / products in inventory
-- =====================================================================
CREATE TABLE IF NOT EXISTS `parts` (
  `id`           VARCHAR(36) NOT NULL,
  `sku`          VARCHAR(100) NOT NULL UNIQUE,
  `name`         VARCHAR(255) NOT NULL,
  `category`     VARCHAR(100) NOT NULL,
  `cost`         DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `price`        DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `stock`        INT NOT NULL DEFAULT 0,
  `min_stock`    INT NOT NULL DEFAULT 2,
  `alt_barcodes` TEXT NULL,                     -- JSON array or comma-separated alternate barcodes
  `created_at`   DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_parts_category` (`category`),
  INDEX `idx_parts_sku` (`sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- TABLE: customers
-- Customer CRM profiles
-- =====================================================================
CREATE TABLE IF NOT EXISTS `customers` (
  `id`               VARCHAR(36) NOT NULL,
  `name`             VARCHAR(255) NOT NULL,
  `phone`            VARCHAR(50) NOT NULL,
  `email`            VARCHAR(255) NULL,
  `outstanding_debt` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `created_at`       DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- TABLE: vehicles
-- Motorcycles linked to customers (one customer, many vehicles)
-- =====================================================================
CREATE TABLE IF NOT EXISTS `vehicles` (
  `id`          VARCHAR(36) NOT NULL,
  `customer_id` VARCHAR(36) NOT NULL,
  `year`        VARCHAR(10) NULL,
  `make`        VARCHAR(100) NOT NULL,
  `model`       VARCHAR(100) NOT NULL,
  `plate`       VARCHAR(50) NULL,
  `vin`         VARCHAR(100) NULL,
  `created_at`  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_vehicles_customer` (`customer_id`),
  CONSTRAINT `fk_vehicles_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- TABLE: service_jobs (Work Orders)
-- Kanban-style repair tracking per vehicle
-- =====================================================================
CREATE TABLE IF NOT EXISTS `service_jobs` (
  `id`            VARCHAR(50) NOT NULL,
  `customer_id`   VARCHAR(36) NULL,
  `customer_name` VARCHAR(255) NOT NULL,
  `vehicle`       VARCHAR(255) NOT NULL,
  `description`   TEXT NOT NULL,
  `mechanic`      VARCHAR(100) NOT NULL,
  `status`        VARCHAR(50) NOT NULL DEFAULT 'Draft',
  `labor_cost`    DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `created_at`    DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_service_jobs_customer` (`customer_id`),
  INDEX `idx_service_jobs_status` (`status`),
  CONSTRAINT `fk_service_jobs_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- TABLE: service_job_parts
-- Parts allocated to a specific work order
-- =====================================================================
CREATE TABLE IF NOT EXISTS `service_job_parts` (
  `id`         VARCHAR(36) NOT NULL,
  `job_id`     VARCHAR(50) NOT NULL,
  `part_id`    VARCHAR(36) NULL,
  `name`       VARCHAR(255) NOT NULL,
  `quantity`   INT NOT NULL DEFAULT 1,
  `price`      DECIMAL(10, 2) NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_sj_parts_job` (`job_id`),
  CONSTRAINT `fk_sj_parts_job` FOREIGN KEY (`job_id`) REFERENCES `service_jobs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_sj_parts_part` FOREIGN KEY (`part_id`) REFERENCES `parts` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- TABLE: transactions
-- Completed sales (Retail POS + Service invoices)
-- =====================================================================
CREATE TABLE IF NOT EXISTS `transactions` (
  `id`             VARCHAR(50) NOT NULL,
  `type`           VARCHAR(50) NOT NULL DEFAULT 'Retail',
  `customer_id`    VARCHAR(36) NULL,
  `customer_name`  VARCHAR(255) NOT NULL DEFAULT 'Walk-in Customer',
  `vehicle`        VARCHAR(255) NULL,
  `subtotal`       DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `tax`            DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `discount`       DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `total`          DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `payment_method` VARCHAR(50) NOT NULL DEFAULT 'Cash',
  `date`           DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_transactions_customer` (`customer_id`),
  INDEX `idx_transactions_date` (`date`),
  CONSTRAINT `fk_transactions_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- TABLE: transaction_items
-- Line items for each completed transaction
-- =====================================================================
CREATE TABLE IF NOT EXISTS `transaction_items` (
  `id`             VARCHAR(36) NOT NULL,
  `transaction_id` VARCHAR(50) NOT NULL,
  `part_id`        VARCHAR(36) NULL,
  `name`           VARCHAR(255) NOT NULL,
  `quantity`       INT NOT NULL DEFAULT 1,
  `price`          DECIMAL(10, 2) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_tx_items_transaction` (`transaction_id`),
  CONSTRAINT `fk_tx_items_transaction` FOREIGN KEY (`transaction_id`) REFERENCES `transactions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- TABLE: mechanics
-- Store mechanics and their roles
-- =====================================================================
CREATE TABLE IF NOT EXISTS `mechanics` (
  `id`          VARCHAR(36) NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `role`        VARCHAR(100) NULL,
  `created_at`  DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- TABLE: labor_records
-- Store individual labor items completed by a mechanic
-- =====================================================================
CREATE TABLE IF NOT EXISTS `labor_records` (
  `id`          VARCHAR(36) NOT NULL,
  `mechanic_id` VARCHAR(36) NOT NULL,
  `description` TEXT NOT NULL,
  `amount`      DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `date`        DATE DEFAULT (CURRENT_DATE),
  `created_at`  DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_labor_records_mechanic` (`mechanic_id`),
  CONSTRAINT `fk_labor_records_mechanic` FOREIGN KEY (`mechanic_id`) REFERENCES `mechanics` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- TABLE: cash_outs
-- Records of cash withdrawals made by the owner from daily sales
-- =====================================================================
CREATE TABLE IF NOT EXISTS `cash_outs` (
  `id`         VARCHAR(36) NOT NULL,
  `amount`     DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `reason`     VARCHAR(255) NOT NULL,
  `notes`      TEXT NULL,
  `date`       DATETIME DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cash_outs_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- TABLE: entry_capitals
-- Records of starting cash for the day
-- =====================================================================
CREATE TABLE IF NOT EXISTS `entry_capitals` (
  `id`         VARCHAR(36) NOT NULL,
  `amount`     DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  `date`       DATETIME DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_entry_capitals_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- SEED DATA - Initial Parts Inventory
-- =====================================================================
INSERT INTO `parts` (`id`, `sku`, `name`, `category`, `cost`, `price`, `stock`, `min_stock`, `alt_barcodes`) VALUES
  (UUID(), 'TYR-PIR-DR4-190', 'Pirelli Diablo Rosso IV Rear Tire (190/55 ZR17)',   'Tires',       145.00, 199.99,  8,  3, '[]'),
  (UUID(), 'TYR-PIR-DR4-120', 'Pirelli Diablo Rosso IV Front Tire (120/70 ZR17)',  'Tires',        95.00, 139.99, 10,  3, '[]'),
  (UUID(), 'BRK-BRM-CC-078',  'Brembo Carbon Ceramic Brake Pads (Front)',          'Brakes',       28.00,  49.99, 15,  5, '[]'),
  (UUID(), 'BRK-BRM-SP-095',  'Brembo Sintered Street Brake Pads (Rear)',          'Brakes',       22.00,  39.99,  2,  4, '[]'),
  (UUID(), 'FLD-MOT-7100-4T', 'Motul 7100 4T 10W-40 Synthetic Oil (1L)',           'Fluids',        9.50,  16.99, 45, 10, '[]'),
  (UUID(), 'FLD-MOT-IN-COOL', 'Motul Inugel Optimal Coolant (1L)',                 'Fluids',        6.00,  11.49, 18,  6, '[]'),
  (UUID(), 'FLT-KN-204',      'K&N Premium Oil Filter (KN-204)',                   'Filters',       7.50,  14.99, 24,  8, '[]'),
  (UUID(), 'CHN-DID-525VX3',  'D.I.D 525VX3 Gold X-Ring Chain (120 Links)',        'Drivetrain',   65.00, 109.99,  5,  2, '[]'),
  (UUID(), 'SPK-NGK-CR9EIX',  'NGK Iridium IX Spark Plug (CR9EIX)',                'Electrical',    4.50,   9.99, 32, 10, '[]'),
  (UUID(), 'BAT-YUA-YTZ10S',  'Yuasa YTZ10S AGM Sealed Battery',                  'Electrical',   60.00,  99.99,  4,  2, '[]'),
  (UUID(), 'ACC-PRO-TAPER-C', 'ProTaper Contour 1-1/8" Handlebars (Black)',        'Accessories',  45.00,  79.99,  6,  2, '[]'),
  (UUID(), 'ACC-RAM-MOUNT-X', 'RAM Mounts X-Grip Phone Holder',                    'Accessories',  20.00,  34.99, 12,  4, '[]'),
  (UUID(), 'TYR-MIC-PR6-180', 'Michelin Road 6 Rear Tire (180/55 ZR17)',           'Tires',       160.00, 224.99,  1,  3, '[]'),
  (UUID(), 'FLD-MAX-CHNLUB',  'Maxima Chain Wax Aerosol (13.5 oz)',                'Fluids',        6.50,  12.99, 20,  5, '[]'),
  (UUID(), 'BRK-EBC-HH-244',  'EBC Double-H Sintered Pads (Front FA244HH)',        'Brakes',       24.00,  44.99,  0,  3, '[]')
ON DUPLICATE KEY UPDATE `sku`=`sku`;

-- =====================================================================
-- SEED DATA - Mechanics
-- =====================================================================
INSERT INTO `mechanics` (`id`, `name`, `role`) VALUES
  (UUID(), 'Diego Master Mechanic', 'Lead Specialist'),
  (UUID(), 'Alex Tech', 'Engine & Tuning Specialist'),
  (UUID(), 'Sam Junior', 'Maintenance & Tires')
ON DUPLICATE KEY UPDATE `name`=`name`;

-- Setup complete!
