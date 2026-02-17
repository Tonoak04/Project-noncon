-- Migration: create MachineWorkLogApproval table for QR/token confirmations on machine work logs

CREATE TABLE IF NOT EXISTS `MachineWorkLogApproval` (
  `Approval_Id` INT NOT NULL AUTO_INCREMENT,
  `MachineWorkLog_Id` INT NOT NULL,
  `Approval_Token` VARCHAR(64) NOT NULL,
  `Token_Expires_At` DATETIME NULL,
  `Inspector_User_Id` INT NULL,
  `Inspector_Approved_At` DATETIME NULL,
  `Inspector_Remark` TEXT NULL,
  `Created_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Updated_At` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`Approval_Id`),
  UNIQUE KEY `uq_mwl_approval_token` (`Approval_Token`),
  UNIQUE KEY `uq_mwl_approval_log` (`MachineWorkLog_Id`),
  CONSTRAINT `fk_mwl_approval_log` FOREIGN KEY (`MachineWorkLog_Id`) REFERENCES `MachineWorkLog` (`MachineWorkLog_Id`) ON DELETE CASCADE,
  KEY `idx_mwl_approval_inspector` (`Inspector_User_Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
