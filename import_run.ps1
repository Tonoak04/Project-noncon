# PowerShell script: รันทั้งหมดอัตโนมัติ
# ใช้จากโฟลเดอร์โปรเจค (C:\Users\oakza\OneDrive\Desktop\Project-NONCON)
# ปรับถ้ารหัสผ่านหรือชื่อ container ต่างออกไป

$container = "project-noncon-db"
$db = "project_noncon"
$dbUser = "root"
$dbPass = "rootpassword"
$csv = ".\mysql-files\machines.csv"
$sql = ".\mysql-files\staging_import.sql"

if (-not (Test-Path $csv)) {
  Write-Host "ERROR: ไม่พบไฟล์ CSV: $csv" -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $sql)) {
  Write-Host "ERROR: ไม่พบไฟล์ SQL: $sql" -ForegroundColor Red
  exit 1
}

Write-Host "Start: docker compose up -d"
docker compose down
docker compose up -d

Write-Host "ตรวจ secure_file_priv & local_infile ..."
docker exec -i $container mysql -u $dbUser -p$dbPass -e "SHOW VARIABLES LIKE 'secure_file_priv'; SHOW GLOBAL VARIABLES LIKE 'local_infile';" $db

Read-Host "กด Enter เพื่อดำเนินการนำเข้า (หรือ Ctrl+C ยกเลิก)"

Write-Host "ส่ง SQL ไปยัง container (รัน staging_import.sql) ..."
Get-Content $sql -Raw | docker exec -i $container mysql -u $dbUser -p$dbPass $db

Write-Host "เสร็จสิ้น: ตรวจสอบจำนวนแถว"
docker exec -i $container mysql -u $dbUser -p$dbPass -e "SELECT COUNT(*) AS rows FROM Machines; SELECT Registered, Tax, Insurance, Duties FROM Machines LIMIT 5;" $db