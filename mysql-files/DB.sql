-- Create Center (users)
CREATE TABLE IF NOT EXISTS Center (
  Center_Id INT AUTO_INCREMENT PRIMARY KEY,
  Username VARCHAR(28) NOT NULL,
  Password VARCHAR(255) NOT NULL,
  Address VARCHAR(255),
  CenterName VARCHAR(255),
  `Role` VARCHAR(32) NOT NULL DEFAULT 'operator',
  Created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Updated_at DATETIME NULL DEFAULT NULL,
  Last_seen DATETIME NULL DEFAULT NULL,
  Name varchar(255) NOT NULL,
  Lastname varchar(255) NOT NULL,
  Phone varchar(12) NOT NULL,
  Employee_Id varchar(20) NOT NULL,
  UNIQUE KEY uq_center_username (Username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- DailyChecklistItem
CREATE TABLE IF NOT EXISTS DailyChecklistItem (
  Item_Id INT AUTO_INCREMENT PRIMARY KEY,
  Item_Order INT NOT NULL,
  Title VARCHAR(255) NOT NULL,
  Standard VARCHAR(255) NULL,
  Frequency VARCHAR(64) NULL,
  Is_Active BOOLEAN NOT NULL DEFAULT TRUE,
  Is_Signature BOOLEAN NOT NULL DEFAULT FALSE,
  Created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Updated_at DATETIME NULL DEFAULT NULL,
  UNIQUE KEY uq_item_order (Item_Order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- DailyForm
CREATE TABLE IF NOT EXISTS DailyForm (
  DailyForm_Id INT AUTO_INCREMENT PRIMARY KEY,
  Machine_Id INT NOT NULL,
  Center_Id INT NOT NULL,
  Form_Month INT NOT NULL,
  Form_Year INT NOT NULL,
  Start_Use_Date DATE NULL,
  Unit_Work VARCHAR(255) NULL,
  Problem_Description TEXT NULL,
  Overall_Status ENUM('ปกติ','ผิดปกติ','S','B','-') NOT NULL DEFAULT '-',
  DFCreated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Updated_at DATETIME NULL DEFAULT NULL,
  CONSTRAINT fk_dailyform_machine FOREIGN KEY (Machine_Id) REFERENCES Machines(Machine_Id) ON DELETE CASCADE,
  CONSTRAINT fk_dailyform_center FOREIGN KEY (Center_Id) REFERENCES Center(Center_Id) ON DELETE CASCADE,
  INDEX idx_dailyform_machine (Machine_Id),
  INDEX idx_dailyform_center (Center_Id),
  UNIQUE KEY uq_dailyform_machine_period_unit (Machine_Id, Form_Year, Form_Month, Unit_Work),
  INDEX idx_dailyform_machine_period (Machine_Id, Form_Year, Form_Month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- DailyChecklistValue
CREATE TABLE IF NOT EXISTS DailyChecklistValue (
  Value_Id INT AUTO_INCREMENT PRIMARY KEY,
  DailyForm_Id INT NOT NULL,
  Item_Id INT NOT NULL,
  Check_Day INT NOT NULL,
  Result ENUM('ปกติ','ผิดปกติ','S','B','-') NOT NULL DEFAULT '-',
  Note TEXT NULL,
  Signature VARCHAR(255) NULL,
  Checked_By VARCHAR(100) NULL,
  Checked_At DATETIME NULL,
  Created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Updated_at DATETIME NULL DEFAULT NULL,
  CONSTRAINT fk_value_form FOREIGN KEY (DailyForm_Id) REFERENCES DailyForm(DailyForm_Id) ON DELETE CASCADE,
  CONSTRAINT fk_value_item FOREIGN KEY (Item_Id) REFERENCES DailyChecklistItem(Item_Id) ON DELETE CASCADE,
  UNIQUE KEY uq_value_form_item_day (DailyForm_Id, Item_Id, Check_Day),
  INDEX idx_value_form (DailyForm_Id),
  INDEX idx_value_item (Item_Id),
  INDEX idx_value_form_item (DailyForm_Id, Item_Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Report
CREATE TABLE IF NOT EXISTS Report (
  Report_Id INT AUTO_INCREMENT PRIMARY KEY,
  Center_Id INT NOT NULL,
  Machine_Id INT NOT NULL,
  Details TEXT NULL,
  Status VARCHAR(50) NULL,
  RPCreated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  Updated_at DATETIME NULL DEFAULT NULL,
  CONSTRAINT fk_report_center FOREIGN KEY (Center_Id) REFERENCES Center(Center_Id) ON DELETE CASCADE,
  CONSTRAINT fk_report_machine FOREIGN KEY (Machine_Id) REFERENCES Machines(Machine_Id) ON DELETE CASCADE,
  INDEX idx_report_center (Center_Id),
  INDEX idx_report_machine (Machine_Id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed one Center user (change later as needed)
INSERT INTO Center (Username, Password, Address, CenterName, Role)
VALUES (
  'admin',
  '$2y$10$ndnwCCo/TEe5eSUkBbc6ze/DjNACXWI0dpdJ5CxHAg5JZGT1v3Wfa',
  'HQ',
  'Main Center',
  'admin'
)
INSERT INTO Center (Username, Password, Address, CenterName, Role)
VALUES (
  'user1',
  '$2y$10$ndnwCCo/TEe5eSUkBbc6ze/DjNACXWI0dpdJ5CxHAg5JZGT1v3Wfa',
  'HQ',
  'Main Center',
  'operator'
)
INSERT INTO Center (Username, Password, Address, CenterName, Role, Name, Lastname, Phone, Employee_Id)
VALUES (
  'EMP002',
  '$2y$10$50bnTot7zAAgXDy279CIDeusdcSU.2t7/4Jzdn16djqSfZkXKkLV6',
  'HQ',
  'Main Center',
  'Foreman',
  'สมชาย',
  'ใจดี',
  '0812345678',
  'EMP002'
)

INSERT INTO Center (Username, Password, Address, CenterName, Role, Name, Lastname, Phone, Employee_Id)
VALUES (
  'EMP003',
  '$2y$10$gHqEd67aisMmEuSCdZif6eyOXC6zUZ0hzaeZa.H0Qv6gwleMTAF4C',
  'HQ',
  'Main Center',
  'driver',
  'สมศักดิ์',
  'ดีใจ',
  '0912345678',
  'EMP003'
)

INSERT INTO Center (Username, Password, Address, CenterName, Role, Name, Lastname, Phone, Employee_Id)
VALUES (
  'Oiler01',
  '$2y$10$ndnwCCo/TEe5eSUkBbc6ze/DjNACXWI0dpdJ5CxHAg5JZGT1v3Wfa',
  'HQ',
  'Main Center',
  'Oiler',
  'ชูใจ',
  'ทองดี',
  '0123456789',
  'Oiler01'
)

'สมปอง'

ON DUPLICATE KEY UPDATE Username=Username;

-- ensure admin role for seeded user
UPDATE Center SET `Role` = 'admin' WHERE Username = 'admin' LIMIT 1;

-- Seed default checklist items (15 items + 2 signature rows)
INSERT INTO DailyChecklistItem (Item_Order, Title, Standard, Frequency, Is_Signature)
VALUES
  (1, 'ระดับน้ำมันเครื่อง', 'อยู่ระดับที่กำหนด', 'รายวัน', FALSE),
  (2, 'เช็กระดับสารหล่อเย็นหม้อน้ำ', 'อยู่ระดับที่กำหนด', 'รายวัน', FALSE),
  (3, 'ตรวจดูรอยรั่วซึมระบบเครื่องยนต์', 'ไม่มีการรั่วซึมของน้ำมัน', 'รายวัน', FALSE),
  (4, 'เช็คระดับน้ำมันไฮดรอลิก', 'อยู่ระดับที่กำหนด', 'รายวัน', FALSE),
  (5, 'เช็คกรองดักน้ำและDrain น้ำทิ้ง', 'อยู่ระดับที่กำหนด', 'รายวัน', FALSE),
  (6, 'เช็ค/อัดจารบีตามจุดข้อต่อและจุดหมุนต่างๆ', 'อัดจารบีทุกจุด', 'รายวัน', FALSE),
  (7, 'เช็คสภาพยางและแรงลมยาง', 'สภาพพร้อมใช้งาน', 'รายวัน', FALSE),
  (8, 'เช็คความตึงโซ่แทร็คและโรลเลอร์ต่างๆ', 'ไม่สึกหรอ,ไม่ตึง-หย่อนเกินไป', 'รายวัน', FALSE),
  (9, 'เช็คการรั่วซึมกระบอกไฮดรอลิกต่างๆ', 'ไม่มีการรั่วซึมของน้ำมัน', 'รายวัน', FALSE),
  (10, 'เช็คการทำงานระบบไฟฟ้าและสัญญานไฟต่างๆ', 'ใช้งานได้ปกติ', 'รายวัน', FALSE),
  (11, 'เช็คสภาพอุปกรณ์ เช่น ปุ้งกี้,เล็บขุด,ใบมีดฯลฯ', 'ใช้งานได้ปกติ', 'รายวัน', FALSE),
  (12, 'เช็คสภาพตัวรถและอุปกรณ์เสริม เช่นกระบะตัวถังฯลฯ', 'ใช้งานได้ปกติ', 'รายวัน', FALSE),
  (13, 'เช็คระดับสารละลายในแบตเตอรี่', 'อยู่ระดับที่กำหนด', 'รายสัปดาห์', FALSE),
  (14, 'เช็คสภาพ/ความดึงสายพานต่างๆหน้าเครื่องยนต์', 'สภาพดี,ไม่ตึง-หย่อนเกินไป', 'รายสัปดาห์', FALSE),
  (15, 'ทำความสะอาด/เป่าไส้กรองอากาศ', 'ไม่เสียรูป', 'รายสัปดาห์', FALSE),
  (16, 'ผู้ตรวจสอบ/พขร. (เขียนชื่อให้ถูกต้อง)', 'ลงชื่อ', 'รายวัน', TRUE),
  (17, 'โฟร์แมนเครื่องจักร/จนท.เครื่องจักร', 'ลงชื่อ', 'รายวัน', TRUE)
ON DUPLICATE KEY UPDATE
  Title = VALUES(Title), Standard = VALUES(Standard), Frequency = VALUES(Frequency), Is_Signature = VALUES(Is_Signature);
