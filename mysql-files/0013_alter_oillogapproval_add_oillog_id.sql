ALTER TABLE OilLogApproval
    ADD COLUMN OilLog_Id INT NULL AFTER Approval_Id,
    ADD CONSTRAINT fk_oillogapproval_oillog FOREIGN KEY (OilLog_Id) REFERENCES OilLog (OilLog_Id) ON DELETE CASCADE,
    ADD UNIQUE KEY uq_oillogapproval_oillog (OilLog_Id);
