-- Migration: add Project_Name to MachineWorkLog
ALTER TABLE `MachineWorkLog`
    ADD COLUMN `Project_Name` VARCHAR(255) NULL DEFAULT NULL AFTER `Work_Order`;
