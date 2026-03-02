<?php
declare(strict_types=1);

require_once __DIR__ . '/server.php';
require_once __DIR__ . '/auth.php';

const DAILY_CHECKLIST_PRESETS = [
    1 => ['title' => 'ระดับน้ำมันเครื่อง', 'standard' => 'อยู่ระดับที่กำหนด', 'frequency' => 'รายวัน', 'is_signature' => false],
    2 => ['title' => 'เช็กระดับสารหล่อเย็นหม้อน้ำ', 'standard' => 'อยู่ระดับที่กำหนด', 'frequency' => 'รายวัน', 'is_signature' => false],
    3 => ['title' => 'ตรวจดูรอยรั่วซึมระบบเครื่องยนต์', 'standard' => 'ไม่มีการรั่วซึมของน้ำมัน', 'frequency' => 'รายวัน', 'is_signature' => false],
    4 => ['title' => 'เช็คระดับน้ำมันไฮดรอลิก', 'standard' => 'อยู่ระดับที่กำหนด', 'frequency' => 'รายวัน', 'is_signature' => false],
    5 => ['title' => 'เช็คกรองดักน้ำและ Drain น้ำทิ้ง', 'standard' => 'อยู่ระดับที่กำหนด', 'frequency' => 'รายวัน', 'is_signature' => false],
    6 => ['title' => 'เช็ค/อัดจารบีตามจุดข้อต่อและจุดหมุนต่างๆ', 'standard' => 'อัดจารบีทุกจุด', 'frequency' => 'รายวัน', 'is_signature' => false],
    7 => ['title' => 'เช็คสภาพยางและแรงลมยาง', 'standard' => 'สภาพพร้อมใช้งาน', 'frequency' => 'รายวัน', 'is_signature' => false],
    8 => ['title' => 'เช็คความตึงโซ่แทร็คและโรลเลอร์ต่างๆ', 'standard' => 'ไม่สึกหรอ, ไม่ตึง-หย่อนเกินไป', 'frequency' => 'รายวัน', 'is_signature' => false],
    9 => ['title' => 'เช็คการรั่วซึมกระบอกไฮดรอลิกต่างๆ', 'standard' => 'ไม่มีการรั่วซึมของน้ำมัน', 'frequency' => 'รายวัน', 'is_signature' => false],
    10 => ['title' => 'เช็คการทำงานระบบไฟฟ้าและสัญญาณไฟต่างๆ', 'standard' => 'ใช้งานได้ปกติ', 'frequency' => 'รายวัน', 'is_signature' => false],
    11 => ['title' => 'เช็คสภาพอุปกรณ์ เช่น ปุ้งกี้, เล็บขุด, ใบมีดฯลฯ', 'standard' => 'ใช้งานได้ปกติ', 'frequency' => 'รายวัน', 'is_signature' => false],
    12 => ['title' => 'เช็คสภาพตัวรถและอุปกรณ์เสริม เช่นกระบะตัวถังฯลฯ', 'standard' => 'ใช้งานได้ปกติ', 'frequency' => 'รายวัน', 'is_signature' => false],
    13 => ['title' => 'เช็คระดับสารละลายในแบตเตอรี่', 'standard' => 'อยู่ระดับที่กำหนด', 'frequency' => 'รายสัปดาห์', 'is_signature' => false],
    14 => ['title' => 'เช็คสภาพ/ความดึงสายพานต่างๆ หน้าเครื่องยนต์', 'standard' => 'สภาพดี, ไม่ตึง-หย่อนเกินไป', 'frequency' => 'รายสัปดาห์', 'is_signature' => false],
    15 => ['title' => 'ทำความสะอาด/เป่าไส้กรองอากาศ', 'standard' => 'ไม่เสียรูป', 'frequency' => 'รายสัปดาห์', 'is_signature' => false],
    16 => ['title' => 'ผู้ตรวจสอบ/พขร. (เขียนชื่อให้ถูกต้อง)', 'standard' => 'ลงชื่อ', 'frequency' => 'รายวัน', 'is_signature' => true],
    17 => ['title' => 'โฟร์แมนเครื่องจักร/จนท.เครื่องจักร', 'standard' => 'ลงชื่อ', 'frequency' => 'รายวัน', 'is_signature' => true],
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    header('Access-Control-Allow-Origin: ' . $origin);
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept');
header('Access-Control-Allow-Credentials: true');
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

class ChecklistLockedException extends RuntimeException {}
class ChecklistNotFoundException extends RuntimeException {}

function parse_period(string $period): array
{
    if (!preg_match('/^(\d{4})-(\d{2})$/', $period, $matches)) {
        throw new InvalidArgumentException('รูปแบบเดือน/ปีไม่ถูกต้อง (YYYY-MM)');
    }
    $year = (int)$matches[1];
    $month = (int)$matches[2];
    if ($month < 1 || $month > 12) {
        throw new InvalidArgumentException('เดือนต้องอยู่ระหว่าง 01-12');
    }
    return ['year' => $year, 'month' => $month];
}

function is_current_period(array $period): bool
{
    try {
        $now = new DateTimeImmutable('now', new DateTimeZone('Asia/Bangkok'));
    } catch (Exception $e) {
        $now = new DateTimeImmutable('now');
    }
    $currentYear = (int)$now->format('Y');
    $currentMonth = (int)$now->format('n');
    return $period['year'] === $currentYear && $period['month'] === $currentMonth;
}

function resolve_machine(PDO $pdo, ?int $machineId, string $machineCode): ?array
{
    if ($machineId && $machineId > 0) {
        $stmt = $pdo->prepare('SELECT Machine_Id, Equipment, Description FROM Machines WHERE Machine_Id = ? LIMIT 1');
        $stmt->execute([$machineId]);
        $row = $stmt->fetch();
        if ($row) {
            return $row;
        }
    }

    $code = trim($machineCode);
    if ($code === '') {
        return null;
    }

    $stmt = $pdo->prepare('SELECT Machine_Id, Equipment, Description FROM Machines WHERE Equipment = ? LIMIT 1');
    $stmt->execute([$code]);
    $row = $stmt->fetch();
    if ($row) {
        return $row;
    }

    if (ctype_digit($code)) {
        $stmt = $pdo->prepare('SELECT Machine_Id, Equipment, Description FROM Machines WHERE Machine_Id = ? LIMIT 1');
        $stmt->execute([(int)$code]);
        $row = $stmt->fetch();
        if ($row) {
            return $row;
        }
    }

    return null;
}

function normalize_department_key(?string $department): string
{
    $value = trim((string)$department);
    if ($value === '') {
        return '';
    }
    return mb_substr($value, 0, 255);
}

function get_daily_form(PDO $pdo, int $machineId, int $year, int $month, ?string $department = null): ?array
{
    $departmentKey = normalize_department_key($department);
    $baseSql = 'SELECT DailyForm_Id, Machine_Id, Center_Id, Form_Month, Form_Year, Unit_Work FROM DailyForm WHERE Machine_Id = ? AND Form_Year = ? AND Form_Month = ?';
    $params = [$machineId, $year, $month];

    $queries = [];
    if ($departmentKey !== '') {
        $queries[] = [$baseSql . ' AND Unit_Work = ? LIMIT 1', array_merge($params, [$departmentKey])];
        $queries[] = [$baseSql . " AND (Unit_Work IS NULL OR Unit_Work = '') LIMIT 1", $params];
    } else {
        $queries[] = [$baseSql . " AND (Unit_Work IS NULL OR Unit_Work = '') LIMIT 1", $params];
    }

    foreach ($queries as [$sql, $sqlParams]) {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($sqlParams);
        $row = $stmt->fetch();
        if ($row) {
            return $row;
        }
    }

    return null;
}

function ensure_daily_form(PDO $pdo, int $machineId, int $centerId, int $year, int $month, ?string $department = null): int
{
    $departmentKey = normalize_department_key($department);
    $existing = get_daily_form($pdo, $machineId, $year, $month, $departmentKey);

    if ($existing) {
        if ((string)($existing['Unit_Work'] ?? '') !== $departmentKey) {
            $stmt = $pdo->prepare('UPDATE DailyForm SET Unit_Work = ?, Updated_at = NOW() WHERE DailyForm_Id = ? LIMIT 1');
            $stmt->execute([$departmentKey, (int)$existing['DailyForm_Id']]);
        }
        return (int)$existing['DailyForm_Id'];
    }

    $stmt = $pdo->prepare("INSERT INTO DailyForm (Machine_Id, Center_Id, Form_Month, Form_Year, Unit_Work, Overall_Status) VALUES (?, ?, ?, ?, ?, '-')");
    $stmt->execute([$machineId, $centerId, $month, $year, $departmentKey]);
    return (int)$pdo->lastInsertId();
}

function ensure_checklist_item(PDO $pdo, int $order): void
{
    if (!isset(DAILY_CHECKLIST_PRESETS[$order])) {
        return;
    }

    $preset = DAILY_CHECKLIST_PRESETS[$order];
    $stmt = $pdo->prepare(
        'INSERT INTO DailyChecklistItem (Item_Order, Title, Standard, Frequency, Is_Signature) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE Title = VALUES(Title), Standard = VALUES(Standard), Frequency = VALUES(Frequency), Is_Signature = VALUES(Is_Signature)'
    );

    try {
        $stmt->execute([
            $order,
            $preset['title'],
            $preset['standard'],
            $preset['frequency'],
            $preset['is_signature'] ? 1 : 0,
        ]);
    } catch (PDOException $e) {
        $sqlState = $e->getCode();
        $message = $e->getMessage();
        if ($sqlState === '42S22' || ($message && stripos($message, 'unknown column') !== false)) {
            throw new RuntimeException('ฐานข้อมูลยังไม่อัปเดต: กรุณาให้ผู้ดูแลรันไฟล์ mysql-files/DB.sql เพื่อเพิ่มคอลัมน์ Is_Signature ในตาราง DailyChecklistItem');
        }
        throw $e;
    }
}

function get_checklist_item_id(PDO $pdo, int $order): int
{
    static $cache = [];
    if (isset($cache[$order])) {
        return $cache[$order];
    }

    $stmt = $pdo->prepare('SELECT Item_Id, Is_Signature FROM DailyChecklistItem WHERE Item_Order = ? LIMIT 1');
    $stmt->execute([$order]);
    $row = $stmt->fetch();
    if (!$row) {
        ensure_checklist_item($pdo, $order);
        $stmt->execute([$order]);
        $row = $stmt->fetch();
    }
    if (!$row) {
        throw new RuntimeException('ไม่พบรายการตรวจสอบ (Item_Order ' . $order . ')');
    }

    $itemId = (int)$row['Item_Id'];
    if ($itemId <= 0) {
        throw new RuntimeException('ไม่พบรายการตรวจสอบ (Item_Order ' . $order . ')');
    }

    $cache[$order] = $itemId;
    return $itemId;
}

function get_signature_item_id(PDO $pdo, int $order = 17): int
{
    return get_checklist_item_id($pdo, $order);
}

function load_signature_values(PDO $pdo, int $dailyFormId, int $itemId): array
{
    $stmt = $pdo->prepare('SELECT Check_Day, Signature, Note FROM DailyChecklistValue WHERE DailyForm_Id = ? AND Item_Id = ? ORDER BY Check_Day');
    $stmt->execute([$dailyFormId, $itemId]);
    $rows = $stmt->fetchAll();
    $values = [];
    foreach ($rows as $row) {
        $dayKey = (string)((int)$row['Check_Day']);
        $values[$dayKey] = [
            'value' => $row['Note'] ?? null,
            'signature' => $row['Signature'] ?? null,
        ];
    }
    return $values;
}

function load_item_results(PDO $pdo, int $dailyFormId): array
{
    $stmt = $pdo->prepare('SELECT i.Item_Order, v.Check_Day, v.Result FROM DailyChecklistValue v INNER JOIN DailyChecklistItem i ON v.Item_Id = i.Item_Id WHERE v.DailyForm_Id = ? AND i.Is_Signature = 0 ORDER BY v.Check_Day, i.Item_Order');
    $stmt->execute([$dailyFormId]);
    $rows = $stmt->fetchAll();
    $matrix = [];
    foreach ($rows as $row) {
        $dayKey = (string)((int)$row['Check_Day']);
        if (!isset($matrix[$dayKey])) {
            $matrix[$dayKey] = [];
        }
        $matrix[$dayKey][(int)$row['Item_Order']] = (string)($row['Result'] ?? '');
    }
    return $matrix;
}

function upsert_signature_value(PDO $pdo, int $dailyFormId, int $itemId, int $day, string $signature, string $employeeId, ?string $selectionCode = null): void
{
    $sql = <<<SQL
INSERT INTO DailyChecklistValue (DailyForm_Id, Item_Id, Check_Day, Result, Note, Signature, Checked_By, Checked_At)
VALUES (:formId, :itemId, :day, '-', :note, :signature, :employee, NOW())
ON DUPLICATE KEY UPDATE Signature = VALUES(Signature), Note = VALUES(Note), Checked_By = VALUES(Checked_By), Checked_At = NOW()
SQL;
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':formId' => $dailyFormId,
        ':itemId' => $itemId,
        ':day' => $day,
        ':note' => $selectionCode,
        ':signature' => $signature,
        ':employee' => $employeeId,
    ]);
}

function upsert_checklist_result(PDO $pdo, int $dailyFormId, int $itemId, int $day, string $result, string $employeeId): void
{
    $sql = <<<SQL
INSERT INTO DailyChecklistValue (DailyForm_Id, Item_Id, Check_Day, Result, Note, Signature, Checked_By, Checked_At)
VALUES (:formId, :itemId, :day, :result, NULL, NULL, :employee, NOW())
ON DUPLICATE KEY UPDATE Result = VALUES(Result), Checked_By = VALUES(Checked_By), Checked_At = NOW()
SQL;
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':formId' => $dailyFormId,
        ':itemId' => $itemId,
        ':day' => $day,
        ':result' => $result,
        ':employee' => $employeeId,
    ]);
}

function build_signature_string(array $user): string
{
    $display = trim(sprintf('%s %s', (string)($user['name'] ?? ''), (string)($user['lastname'] ?? '')));
    if ($display === '') {
        $display = (string)($user['displayName'] ?? $user['Username'] ?? '');
    }
    return mb_substr($display, 0, 255);
}

function handle_checklist_get(array $user): void
{
    $pdo = db_connection();
    $machineIdParam = isset($_GET['machineId']) ? (int)$_GET['machineId'] : null;
    $machineCode = isset($_GET['machine']) ? trim((string)$_GET['machine']) : '';
    $periodRaw = isset($_GET['period']) ? trim((string)$_GET['period']) : '';
    $departmentName = isset($_GET['department']) ? trim((string)$_GET['department']) : '';

    if ($periodRaw === '' || ($machineIdParam === null && $machineCode === '')) {
        throw new InvalidArgumentException('ต้องระบุรหัสเครื่องและเดือน/ปี');
    }
    if ($departmentName === '') {
        throw new InvalidArgumentException('ต้องระบุหน่วยงาน');
    }

    $period = parse_period($periodRaw);
    $machine = resolve_machine($pdo, $machineIdParam, $machineCode);
    if (!$machine) {
        json_response(['error' => 'ไม่พบข้อมูลเครื่องจักร'], 404);
        return;
    }

    $form = get_daily_form($pdo, (int)$machine['Machine_Id'], $period['year'], $period['month'], $departmentName);
    $driverValues = [];
    $foremanValues = [];
    $itemMatrix = [];
    if ($form) {
        $driverItemId = get_signature_item_id($pdo, 16);
        $foremanItemId = get_signature_item_id($pdo, 17);
        $driverValues = load_signature_values($pdo, (int)$form['DailyForm_Id'], $driverItemId);
        $foremanValues = load_signature_values($pdo, (int)$form['DailyForm_Id'], $foremanItemId);
        $itemMatrix = load_item_results($pdo, (int)$form['DailyForm_Id']);
    }

    $meta = null;
    if ($form) {
        $meta = [
            'department' => $form['Unit_Work'] ?? null,
            'issueNotes' => $form['Problem_Description'] ?? null,
        ];
    }

    json_response([
        'machine' => [
            'id' => (int)$machine['Machine_Id'],
            'code' => (string)($machine['Equipment'] ?? $machineCode),
            'description' => $machine['Description'] ?? null,
        ],
        'period' => $period,
        'meta' => $meta,
        'items' => [
            'values' => $itemMatrix,
        ],
        'driver' => [
            'values' => $driverValues,
            'lockedDays' => array_map('intval', array_keys($driverValues)),
        ],
        'foreman' => [
            'values' => $foremanValues,
            'lockedDays' => array_map('intval', array_keys($foremanValues)),
        ],
    ]);
}

function handle_checklist_post(array $user): void
{
    $isForeman = user_has_role($user, 'foreman');
    $isAdmin = user_has_role($user, 'admin');
    $isDriver = user_has_role($user, 'driver') || (!$isForeman && !$isAdmin);

    $raw = file_get_contents('php://input') ?: '';
    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        throw new InvalidArgumentException('ข้อมูลไม่ถูกต้อง');
    }

    $machineIdParam = isset($payload['machineId']) ? (int)$payload['machineId'] : null;
    $machineCode = isset($payload['machineCode']) ? trim((string)$payload['machineCode']) : '';
    $periodRaw = isset($payload['period']) ? trim((string)$payload['period']) : '';
    $signatures = isset($payload['signatures']) && is_array($payload['signatures']) ? $payload['signatures'] : [];
    $itemsPayload = isset($payload['items']) && is_array($payload['items']) ? $payload['items'] : [];
    $signatureType = isset($payload['signatureType']) ? strtolower(trim((string)$payload['signatureType'])) : ($isForeman ? 'foreman' : 'driver');
    $departmentName = isset($payload['department']) ? trim((string)$payload['department']) : '';
    $issueNotesProvided = array_key_exists('issueNotes', $payload);
    $issueNotesValue = $issueNotesProvided ? trim((string)$payload['issueNotes']) : null;
    if ($issueNotesProvided && $issueNotesValue !== null && mb_strlen($issueNotesValue) > 2000) {
        throw new InvalidArgumentException('รายละเอียดปัญหายาวเกินไป (สูงสุด 2000 ตัวอักษร)');
    }

    if (!in_array($signatureType, ['driver', 'foreman'], true)) {
        throw new InvalidArgumentException('ไม่รู้จักประเภทลายเซ็น');
    }
    if ($signatureType === 'foreman' && !$isForeman) {
        json_response(['error' => 'อนุญาตเฉพาะโฟร์แมนสำหรับลายเซ็นนี้'], 403);
        return;
    }
    if ($signatureType === 'driver' && !$isDriver) {
        json_response(['error' => 'อนุญาตเฉพาะพนักงานขับเครื่องจักรสำหรับลายเซ็นนี้'], 403);
        return;
    }

    if ($periodRaw === '' || ($machineIdParam === null && $machineCode === '')) {
        throw new InvalidArgumentException('กรุณากรอกข้อมูลให้ครบถ้วน');
    }
    if ($departmentName === '') {
        throw new InvalidArgumentException('กรุณาระบุหน่วยงาน');
    }

    $hasSignatures = false;
    foreach ($signatures as $value) {
        if ((string)$value !== '') {
            $hasSignatures = true;
            break;
        }
    }

    $hasItems = false;
    foreach ($itemsPayload as $dayItems) {
        if (!is_array($dayItems)) {
            continue;
        }
        foreach ($dayItems as $result) {
            if ($result !== null && $result !== '') {
                $hasItems = true;
                break 2;
            }
        }
    }

    if (!$hasSignatures && !$hasItems && !$issueNotesProvided) {
        throw new InvalidArgumentException('ยังไม่มีข้อมูลสำหรับบันทึก');
    }

    $period = parse_period($periodRaw);
    $pdo = db_connection();
    $pdo->beginTransaction();
    try {
        $machine = resolve_machine($pdo, $machineIdParam, $machineCode);
        if (!$machine) {
            throw new ChecklistNotFoundException('ไม่พบข้อมูลเครื่องจักร');
        }
        $formId = ensure_daily_form($pdo, (int)$machine['Machine_Id'], (int)$user['Center_Id'], $period['year'], $period['month'], $departmentName);
        $employeeId = (string)($user['employeeId'] ?? $user['Username'] ?? '');
        $signatureValue = build_signature_string($user);

        $insertedDays = [];
        $insertedItems = [];

        if ($hasSignatures) {
            if ($signatureValue === '') {
                throw new RuntimeException('ไม่พบชื่อที่ใช้ลงลายเซ็น');
            }
            $itemOrder = $signatureType === 'driver' ? 16 : 17;
            $itemId = get_signature_item_id($pdo, $itemOrder);
            foreach ($signatures as $dayKey => $rawValue) {
                $day = (int)$dayKey;
                if ($day < 1 || $day > 31) {
                    throw new InvalidArgumentException('วันต้องอยู่ระหว่าง 1-31');
                }
                if ((string)$rawValue === '') {
                    continue;
                }
                $selectionCode = trim((string)$rawValue) ?: null;
                upsert_signature_value($pdo, $formId, $itemId, $day, $signatureValue, $employeeId, $selectionCode);
                if (!in_array($day, $insertedDays, true)) {
                    $insertedDays[] = $day;
                }
            }
        }

        if ($hasItems) {
            $validResults = ['ปกติ', 'ผิดปกติ', 'S', 'B', '-'];
            foreach ($itemsPayload as $dayKey => $items) {
                $day = (int)$dayKey;
                if ($day < 1 || $day > 31) {
                    throw new InvalidArgumentException('วันต้องอยู่ระหว่าง 1-31');
                }
                if (!is_array($items)) {
                    continue;
                }
                foreach ($items as $orderKey => $result) {
                    $order = (int)$orderKey;
                    if ($order < 1 || $order > 15) {
                        throw new InvalidArgumentException('หมายเลขข้อไม่ถูกต้อง');
                    }
                    $resultString = trim((string)$result);
                    if ($resultString === '') {
                        continue;
                    }
                    if (!in_array($resultString, $validResults, true)) {
                        throw new InvalidArgumentException('ค่าการตรวจสอบไม่ถูกต้อง');
                    }
                    $itemId = get_checklist_item_id($pdo, $order);
                    upsert_checklist_result($pdo, $formId, $itemId, $day, $resultString, $employeeId);
                    $insertedItems[] = [
                        'day' => $day,
                        'order' => $order,
                        'value' => $resultString,
                    ];
                }
            }
        }

        if ($issueNotesProvided) {
            $noteToStore = ($issueNotesValue === null || $issueNotesValue === '') ? null : $issueNotesValue;
            $stmt = $pdo->prepare('UPDATE DailyForm SET Problem_Description = ?, Updated_at = NOW() WHERE DailyForm_Id = ? LIMIT 1');
            $stmt->execute([$noteToStore, $formId]);
        }

        $pdo->commit();
        json_response([
            'ok' => true,
            'lockedDays' => array_map('intval', $insertedDays),
            'signatureType' => $hasSignatures ? $signatureType : null,
            'itemsLocked' => $insertedItems,
        ]);
    } catch (ChecklistLockedException $e) {
        $pdo->rollBack();
        json_response(['error' => $e->getMessage()], 409);
    } catch (InvalidArgumentException $e) {
        $pdo->rollBack();
        json_response(['error' => $e->getMessage()], 400);
    } catch (ChecklistNotFoundException $e) {
        $pdo->rollBack();
        json_response(['error' => $e->getMessage()], 404);
    } catch (Throwable $e) {
        $pdo->rollBack();
        json_response(['error' => 'เกิดข้อผิดพลาดในการบันทึกแบบฟอร์ม'], 500);
    }
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $user = require_auth();
    if ($method === 'GET') {
        handle_checklist_get($user);
    } elseif ($method === 'POST') {
        handle_checklist_post($user);
    } else {
        json_response(['error' => 'Method Not Allowed'], 405);
    }
} catch (InvalidArgumentException $e) {
    json_response(['error' => $e->getMessage()], 400);
} catch (ChecklistLockedException $e) {
    json_response(['error' => $e->getMessage()], 409);
} catch (ChecklistNotFoundException $e) {
    json_response(['error' => $e->getMessage()], 404);
} catch (Throwable $e) {
    json_response(['error' => $e->getMessage()], 500);
}
