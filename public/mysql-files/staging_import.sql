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

-- สร้าง staging table (ทุกคอลัมน์เป็น TEXT เพื่อหลีกเลี่ยง error จากรูปแบบไม่ตรง)
CREATE TABLE IF NOT EXISTS staging_machines (
  c1 TEXT, c2 TEXT, c3 TEXT, c4 TEXT, c5 TEXT, c6 TEXT, c7 TEXT, c8 TEXT, c9 TEXT, c10 TEXT,
  c11 TEXT, c12 TEXT, c13 TEXT, c14 TEXT, c15 TEXT, c16 TEXT, c17 TEXT, c18 TEXT, c19 TEXT, c20 TEXT,
  c21 TEXT, c22 TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

TRUNCATE TABLE staging_machines;

-- โหลด CSV ลง staging (server-side LOAD DATA INFILE)
LOAD DATA INFILE '/var/lib/mysql-files/machines.csv'
INTO TABLE staging_machines
CHARACTER SET utf8mb4
FIELDS TERMINATED BY ',' ENCLOSED BY '"' 
LINES TERMINATED BY '\n'
IGNORE 1 LINES
(c1,c2,c3,c4,c5,c6,c7,c8,c9,c10,c11,c12,c13,c14,c15,c16,c17,c18,c19,c20,c21,c22);

-- ตรวจ/แก้ข้อมูลแล้วย้ายเข้า Machines
-- เฉพาะคอลัมน์วันที่: แปลงเฉพาะที่ match รูปแบบ dd/mm/yyyy, อื่น ๆ ให้เป็น NULL
INSERT INTO Machines (
  Machine_Type, Company_code, `Recipient`, Equipment, Description, `Status`, Specification,
  Chassis_Number, Engine_Serial_Number, Engine_Model, Engine_Power, Engine_Capacity,
  License_plate_Number, Tax, Insurance, Duties, Note, `Class`, Assest_Number,
  Manufacture, `Keyword`, Registered
)
SELECT
  NULLIF(c1,''), NULLIF(c2,''), NULLIF(c3,''), NULLIF(c4,''), NULLIF(c5,''), NULLIF(c6,''), NULLIF(c7,''),
  NULLIF(c8,''), NULLIF(c9,''), NULLIF(c10,''), NULLIF(c11,''), NULLIF(c12,''),
  NULLIF(c13,''),
  CASE WHEN TRIM(c14) = '' THEN NULL
      WHEN c14 REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN STR_TO_DATE(c14, '%d/%m/%Y')
      ELSE NULL END,
  CASE WHEN TRIM(c15) = '' THEN NULL
      WHEN c15 REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN STR_TO_DATE(c15, '%d/%m/%Y')
      ELSE NULL END,
  CASE WHEN NULLIF(REPLACE(c16,',',''), '') IS NULL THEN NULL ELSE CAST(REPLACE(c16,',','') AS DECIMAL(12,2)) END,
  NULLIF(c17,''), NULLIF(c18,''), NULLIF(c19,''), NULLIF(c20,''), NULLIF(c21,''),
  CASE WHEN TRIM(c22) = '' THEN NULL
      WHEN c22 REGEXP '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$' THEN STR_TO_DATE(c22, '%d/%m/%Y')
      ELSE NULL END
FROM staging_machines;

-- ถ้าต้องการลบ staging เมื่อเสร็จ uncomment บรรทัดด้านล่าง
DROP TABLE IF EXISTS staging_machines;