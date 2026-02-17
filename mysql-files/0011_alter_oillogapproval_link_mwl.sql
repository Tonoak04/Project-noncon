-- Migration: retarget OilLogApproval to MachineWorkLog and remove inspector columns
SET @fk := (
        SELECT CONSTRAINT_NAME
        FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
            AND TABLE_NAME = 'OilLogApproval'
            AND CONSTRAINT_NAME = 'fk_oillogapproval_oillog'
        LIMIT 1
);
SET @sql := IF(@fk IS NOT NULL, CONCAT('ALTER TABLE `OilLogApproval` DROP FOREIGN KEY `', @fk, '`'), 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'OilLogApproval'
            AND INDEX_NAME = 'uq_oillogapproval_log'
        LIMIT 1
);
SET @sql := IF(@idx IS NOT NULL, 'ALTER TABLE `OilLogApproval` DROP INDEX `uq_oillogapproval_log`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'OilLogApproval'
            AND INDEX_NAME = 'idx_oillogapproval_inspector'
        LIMIT 1
);
SET @sql := IF(@idx IS NOT NULL, 'ALTER TABLE `OilLogApproval` DROP INDEX `idx_oillogapproval_inspector`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'OilLogApproval'
            AND COLUMN_NAME = 'MachineWorkLog_Id'
);
SET @sql := IF(@col = 0, 'ALTER TABLE `OilLogApproval` ADD COLUMN `MachineWorkLog_Id` INT NULL AFTER `Approval_Id`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'OilLogApproval'
          AND COLUMN_NAME = 'OilLog_Id'
);
SET @sql := IF(@col > 0,
        'UPDATE `OilLogApproval` oa
                JOIN OilLog log ON log.OilLog_Id = oa.OilLog_Id
                SET oa.MachineWorkLog_Id = (
                        SELECT mwl.MachineWorkLog_Id
                        FROM MachineWorkLog mwl
                        WHERE mwl.Machine_Code = log.Machine_Code
                          AND mwl.Document_Date <= log.Document_Date
                        ORDER BY mwl.Document_Date DESC, mwl.MachineWorkLog_Id DESC
                        LIMIT 1
                )
                WHERE oa.MachineWorkLog_Id IS NULL',
        'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'OilLogApproval'
            AND COLUMN_NAME = 'OilLog_Id'
);
SET @sql := IF(@col > 0, 'ALTER TABLE `OilLogApproval` DROP COLUMN `OilLog_Id`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'OilLogApproval'
            AND COLUMN_NAME = 'Inspector_User_Id'
);
SET @sql := IF(@col > 0, 'ALTER TABLE `OilLogApproval` DROP COLUMN `Inspector_User_Id`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'OilLogApproval'
            AND COLUMN_NAME = 'Inspector_Approved_At'
);
SET @sql := IF(@col > 0, 'ALTER TABLE `OilLogApproval` DROP COLUMN `Inspector_Approved_At`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
        SELECT COUNT(*)
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'OilLogApproval'
            AND COLUMN_NAME = 'Inspector_Remark'
);
SET @sql := IF(@col > 0, 'ALTER TABLE `OilLogApproval` DROP COLUMN `Inspector_Remark`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx := (
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'OilLogApproval'
            AND INDEX_NAME = 'uq_oillogapproval_mwl'
        LIMIT 1
);
SET @sql := IF(@idx IS NOT NULL, 'ALTER TABLE `OilLogApproval` DROP INDEX `uq_oillogapproval_mwl`', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := 'ALTER TABLE `OilLogApproval` ADD UNIQUE INDEX `uq_oillogapproval_mwl` (`MachineWorkLog_Id`)';
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk := (
        SELECT CONSTRAINT_NAME
        FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE()
            AND TABLE_NAME = 'OilLogApproval'
            AND CONSTRAINT_NAME = 'fk_oillogapproval_mwl'
        LIMIT 1
);
SET @sql := IF(@fk IS NOT NULL, CONCAT('ALTER TABLE `OilLogApproval` DROP FOREIGN KEY `', @fk, '`'), 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := 'ALTER TABLE `OilLogApproval` ADD CONSTRAINT `fk_oillogapproval_mwl` FOREIGN KEY (`MachineWorkLog_Id`) REFERENCES `MachineWorkLog` (`MachineWorkLog_Id`) ON DELETE CASCADE';
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
