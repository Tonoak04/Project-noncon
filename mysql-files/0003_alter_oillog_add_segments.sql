-- Migration: extend OilLog table with meter, time segment, and checklist fields
-- Apply after 0002_create_oil_log_table.sql has been executed.

ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Work_Meter_Start` DECIMAL(10,2) DEFAULT NULL AFTER `Odometer_End`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Work_Meter_End` DECIMAL(10,2) DEFAULT NULL AFTER `Work_Meter_Start`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Work_Meter_Total` DECIMAL(10,2) DEFAULT NULL AFTER `Work_Meter_End`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Time_Morning_Start` TIME DEFAULT NULL AFTER `Work_Meter_Total`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Time_Morning_End` TIME DEFAULT NULL AFTER `Time_Morning_Start`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Time_Morning_Total` DECIMAL(6,2) DEFAULT NULL AFTER `Time_Morning_End`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Time_Afternoon_Start` TIME DEFAULT NULL AFTER `Time_Morning_Total`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Time_Afternoon_End` TIME DEFAULT NULL AFTER `Time_Afternoon_Start`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Time_Afternoon_Total` DECIMAL(6,2) DEFAULT NULL AFTER `Time_Afternoon_End`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Time_Ot_Start` TIME DEFAULT NULL AFTER `Time_Afternoon_Total`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Time_Ot_End` TIME DEFAULT NULL AFTER `Time_Ot_Start`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Time_Ot_Total` DECIMAL(6,2) DEFAULT NULL AFTER `Time_Ot_End`;
ALTER TABLE `OilLog`
  ADD COLUMN IF NOT EXISTS `Checklist_JSON` TEXT DEFAULT NULL AFTER `Notes`;
