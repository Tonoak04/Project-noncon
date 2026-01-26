-- Migration: add admin remark column for Report table
ALTER TABLE `Report`
    ADD COLUMN IF NOT EXISTS `Admin_Remark` TEXT NULL DEFAULT NULL AFTER `Details`;
