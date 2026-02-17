-- Migration: create OilLogApproval table for QR/token-driven confirmations
-- Run after 0006_add_center_last_seen.sql

CREATE TABLE IF NOT EXISTS `OilLogApproval` (
  `Approval_Id` INT NOT NULL AUTO_INCREMENT,
  `MachineWorkLog_Id` INT NULL,
  `Approval_Token` VARCHAR(64) NOT NULL,
  `Token_Expires_At` DATETIME NULL,
  `Oiler_User_Id` INT NULL,
  `Oiler_Approved_At` DATETIME NULL,
  `Oiler_Remark` TEXT NULL,
  `Created_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Updated_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`Approval_Id`),
  UNIQUE KEY `uq_oillogapproval_token` (`Approval_Token`),
  UNIQUE KEY `uq_oillogapproval_mwl` (`MachineWorkLog_Id`),
  KEY `idx_oillogapproval_oiler` (`Oiler_User_Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
