-- Migration: add a JSON column to track oil log photo attachments.
-- Run after 0003_alter_oillog_add_segments.sql.

ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Photo_Attachments_JSON` JSON DEFAULT NULL AFTER `Fuel_Details_JSON`;
