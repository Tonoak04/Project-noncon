CREATE TABLE IF NOT EXISTS Machines (
  Machine_Id INT AUTO_INCREMENT PRIMARY KEY,
  Machine_Type enum('Heavy','Support','Plant','Vehicle','Crane') DEFAULT NULL,
  Company_code VARCHAR(50),
  `Recipient` VARCHAR(255),
  Equipment VARCHAR(50),
  Description TEXT,
  `Status` VARCHAR(255),
  Specification TEXT,
  Chassis_Number VARCHAR(200),
  Engine_Serial_Number VARCHAR(200),
  Engine_Model VARCHAR(200),
  Engine_Power VARCHAR(10),
  Engine_Capacity VARCHAR(10),
  License_plate_Number VARCHAR(100),
  Tax DATE,
  Insurance DATE,
  Duties INT(10),
  Note TEXT,
  `Class` VARCHAR(20),
  Assest_Number VARCHAR(100),
  Manufacture VARCHAR(200),
  `Keyword` VARCHAR(255),
  Registered DATE,
  MCCreated_at DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET SESSION autocommit=0;
SET SESSION unique_checks=0;
SET SESSION foreign_key_checks=0;

LOAD DATA INFILE '/path/to/machines.csv'
INTO TABLE Machines
CHARACTER SET utf8mb4
FIELDS TERMINATED BY ',' ENCLOSED BY '"' 
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(@c1,@c2,@c3,@c4,@c5,@c6,@c7,@c8,@c9,@c10,@c11,@c12,@c13,@c14,@c15,@c16,@c17,@c18,@c19,@c20,@c21,@c22)
SET
  Machine_Type = NULLIF(@c1,''),
  Company_code = NULLIF(@c2,''),
  `Recipient` = NULLIF(@c3,''),
  Equipment = NULLIF(@c4,''),
  Description = NULLIF(@c5,''),
  `Status` = NULLIF(@c6,''),
  Specification = NULLIF(@c7,''),
  Chassis_Number = NULLIF(@c8,''),
  Engine_Serial_Number = NULLIF(@c9,''),
  Engine_Model = NULLIF(@c10,''),
  Engine_Power = NULLIF(@c11,''),
  Engine_Capacity = NULLIF(@c12,''),
  License_plate_Number = NULLIF(@c13,''),
  Tax = CASE WHEN TRIM(@c14) = '' THEN NULL ELSE STR_TO_DATE(@c14, '%d/%m/%Y') END,
  Insurance = CASE WHEN TRIM(@c15) = '' THEN NULL ELSE STR_TO_DATE(@c15, '%d/%m/%Y') END,
  Duties = CASE WHEN NULLIF(REPLACE(@c16,',',''), '') IS NULL THEN NULL ELSE CAST(REPLACE(@c16,',','') AS DECIMAL(12,2)) END,
  Note = NULLIF(@c17,''),
  `Class` = NULLIF(@c18,''),
  Assest_Number = NULLIF(@c19,''),
  Manufacture = NULLIF(@c20,''),
  `Keyword` = NULLIF(@c21,''),
  Registered = CASE WHEN TRIM(@c22) = '' THEN NULL ELSE STR_TO_DATE(@c22, '%d/%m/%Y') END,
  MCCreated_at = NOW();

COMMIT;

SET SESSION unique_checks=1;
SET SESSION foreign_key_checks=1;
SET SESSION autocommit=1;