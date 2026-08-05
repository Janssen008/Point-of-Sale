-- =====================================================================
-- ApexMoto POS — Sync Queue Table (MySQL Migration)
-- 
-- Run this in phpMyAdmin:
-- 1. Select `apexmoto_pos` database
-- 2. Go to "SQL" tab
-- 3. Paste this script and click "Go"
-- =====================================================================

USE `apexmoto_pos`;

CREATE TABLE IF NOT EXISTS `sync_queue` (
  `id`         INT AUTO_INCREMENT PRIMARY KEY,
  `table_name` VARCHAR(100) NOT NULL,
  `record_id`  VARCHAR(50) NOT NULL,
  `action`     ENUM('upsert', 'delete', 'delete_all') NOT NULL DEFAULT 'upsert',
  `payload`    JSON NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `synced`     BOOLEAN DEFAULT FALSE,
  `synced_at`  DATETIME NULL,
  `error_msg`  VARCHAR(500) NULL,
  `retries`    INT DEFAULT 0,
  INDEX `idx_sync_pending` (`synced`, `created_at`),
  INDEX `idx_sync_table`   (`table_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Track last full sync timestamp
CREATE TABLE IF NOT EXISTS `sync_meta` (
  `key_name`  VARCHAR(100) PRIMARY KEY,
  `value`     TEXT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `sync_meta` (`key_name`, `value`) VALUES
  ('last_full_sync', NULL),
  ('sync_enabled', 'true')
ON DUPLICATE KEY UPDATE `key_name`=`key_name`;
