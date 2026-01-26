-- Migration: create Report table used by php/server/reports.php
-- Run this in your MySQL (phpMyAdmin or mysql CLI) for database `project_noncon`.

CREATE TABLE IF NOT EXISTS `Report` (
  `Report_Id` INT NOT NULL AUTO_INCREMENT,
  `Center_Id` INT DEFAULT NULL,
  `Machine_Id` INT DEFAULT NULL,
  `Details` TEXT,
  `Admin_Remark` TEXT DEFAULT NULL,
  `Photo` VARCHAR(2048) DEFAULT NULL,
  `Status` VARCHAR(50) DEFAULT 'new',
  `RPCreated_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `Updated_at` DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`Report_Id`),
  INDEX `idx_report_center` (`Center_Id`),
  INDEX `idx_report_machine` (`Machine_Id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
