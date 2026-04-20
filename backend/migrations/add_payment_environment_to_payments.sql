-- Add payment_environment (SANDBOX / LIVE) if missing — required by /api/payment/notify updates.

SET @has_col := (
    SELECT COUNT(*)
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'payments'
      AND COLUMN_NAME = 'payment_environment'
);

SET @sql := IF(
    @has_col = 0,
    'ALTER TABLE payments ADD COLUMN payment_environment VARCHAR(20) NULL DEFAULT NULL AFTER payment_status',
    'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
