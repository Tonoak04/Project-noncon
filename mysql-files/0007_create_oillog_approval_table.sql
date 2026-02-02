-- Migration: create OilLogApproval table for QR/token-driven confirmations
-- Run after 0006_add_center_last_seen.sql

CREATE TABLE IF NOT EXISTS `OilLogApproval` (
  `Approval_Id` INT NOT NULL AUTO_INCREMENT,
  `OilLog_Id` INT NOT NULL,
  `Approval_Token` VARCHAR(64) NOT NULL,
  `Token_Expires_At` DATETIME NULL,
  `Oiler_User_Id` INT NULL,
  `Oiler_Approved_At` DATETIME NULL,
  `Oiler_Remark` TEXT NULL,
  `Inspector_User_Id` INT NULL,
  `Inspector_Approved_At` DATETIME NULL,
  `Inspector_Remark` TEXT NULL,
  `Created_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Updated_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`Approval_Id`),
  UNIQUE KEY `uq_oillogapproval_token` (`Approval_Token`),
  UNIQUE KEY `uq_oillogapproval_log` (`OilLog_Id`),
  CONSTRAINT `fk_oillogapproval_oillog` FOREIGN KEY (`OilLog_Id`) REFERENCES `OilLog` (`OilLog_Id`) ON DELETE CASCADE,
  KEY `idx_oillogapproval_oiler` (`Oiler_User_Id`),
  KEY `idx_oillogapproval_inspector` (`Inspector_User_Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
