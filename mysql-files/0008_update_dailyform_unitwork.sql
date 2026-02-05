ALTER TABLE DailyForm
    DROP INDEX uq_dailyform_machine_period,
    ADD UNIQUE KEY uq_dailyform_machine_period_unit (Machine_Id, Form_Year, Form_Month, Unit_Work);
