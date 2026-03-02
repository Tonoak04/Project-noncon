<?php
declare(strict_types=1);

require_once __DIR__ . '/server.php';
require_once __DIR__ . '/auth.php';

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

function mwl_normalize_string($value, int $maxLen = 255): ?string
{
    if ($value === null) {
        return null;
    }
    $trimmed = trim((string)$value);
    if ($trimmed === '') {
        return null;
    }
    if (mb_strlen($trimmed) > $maxLen) {
        $trimmed = mb_substr($trimmed, 0, $maxLen);
    }
    return $trimmed;
}

function mwl_normalize_text($value, int $maxLen = 2000): ?string
{
    return mwl_normalize_string($value, $maxLen);
}

function mwl_normalize_datetime($value): ?string
{
    if ($value === null) {
        return null;
    }
    $trimmed = trim((string)$value);
    if ($trimmed === '') {
        return null;
    }
    $ts = strtotime($trimmed);
    if ($ts === false) {
        return null;
    }
    return date('Y-m-d H:i:s', $ts);
}

function mwl_normalize_date($value): ?string
{
    $dt = mwl_normalize_datetime($value);
    if ($dt === null) {
        return null;
    }
    return substr($dt, 0, 10);
}

function mwl_normalize_time($value): ?string
{
    if ($value === null) {
        return null;
    }
    $trimmed = trim((string)$value);
    if ($trimmed === '') {
        return null;
    }
    $formats = ['H:i', 'H:i:s'];
    foreach ($formats as $fmt) {
        $dt = DateTime::createFromFormat($fmt, $trimmed);
        if ($dt instanceof DateTime) {
            return $dt->format('H:i:s');
        }
    }
    return null;
}

function mwl_normalize_decimal($value): ?float
{
    if ($value === null) {
        return null;
    }
    if (is_string($value)) {
        $value = str_replace([',', ' '], '', $value);
    }
    if ($value === '' || $value === null) {
        return null;
    }
    if (!is_numeric($value)) {
        return null;
    }
    return round((float)$value, 2);
}

function mwl_time_to_seconds(?string $time): ?int
{
    if ($time === null) {
        return null;
    }
    $parts = explode(':', $time);
    if (count($parts) < 2) {
        return null;
    }
    $hours = (int)$parts[0];
    $minutes = (int)$parts[1];
    $seconds = isset($parts[2]) ? (int)$parts[2] : 0;
    return ($hours * 3600) + ($minutes * 60) + $seconds;
}

function mwl_diff_time_hours(?string $start, ?string $end): ?float
{
    $startSeconds = mwl_time_to_seconds($start);
    $endSeconds = mwl_time_to_seconds($end);
    if ($startSeconds === null || $endSeconds === null) {
        return null;
    }
    $diff = $endSeconds - $startSeconds;
    if ($diff < 0) {
        $diff += 86400;
    }
    return round($diff / 3600, 2);
}

function mwl_normalize_work_orders($input): array
{
    $result = [];
    if (is_array($input)) {
        foreach ($input as $entry) {
            $normalized = mwl_normalize_string($entry, 200);
            if ($normalized !== null && $normalized !== '') {
                $result[] = $normalized;
            }
        }
    } elseif ($input !== null) {
        $normalized = mwl_normalize_string($input, 200);
        if ($normalized !== null && $normalized !== '') {
            $result[] = $normalized;
        }
    }
    return $result;
}

function mwl_resolve_session_display_name(array $user): ?string
{
    if (isset($user['displayName'])) {
        $label = trim((string)$user['displayName']);
        if ($label !== '') {
            return $label;
        }
    }
    $parts = [];
    if (!empty($user['name'])) {
        $parts[] = trim((string)$user['name']);
    }
    if (!empty($user['lastname'])) {
        $parts[] = trim((string)$user['lastname']);
    }
    $full = trim(implode(' ', array_filter($parts)));
    if ($full !== '') {
        return $full;
    }
    if (!empty($user['Username'])) {
        $username = trim((string)$user['Username']);
        if ($username !== '') {
            return $username;
        }
    }
    return null;
}

function mwl_compose_center_display_name($username, $firstName, $lastName): ?string
{
    $full = trim(sprintf('%s %s', (string)$firstName, (string)$lastName));
    if ($full !== '') {
        return $full;
    }
    $username = trim((string)$username);
    return $username !== '' ? $username : null;
}

function mwl_fetch_center_user_by_id(PDO $pdo, int $centerId): ?array
{
    $stmt = $pdo->prepare('SELECT Center_Id, Username, Name, Lastname, `Role` FROM Center WHERE Center_Id = :id LIMIT 1');
    $stmt->execute([':id' => $centerId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function mwl_generate_approval_token(PDO $pdo): string
{
    for ($i = 0; $i < 6; $i++) {
        $candidate = bin2hex(random_bytes(20));
        $stmt = $pdo->prepare('SELECT Approval_Id FROM MachineWorkLogApproval WHERE Approval_Token = :token LIMIT 1');
        $stmt->execute([':token' => $candidate]);
        if ($stmt->fetch() === false) {
            return $candidate;
        }
    }
    throw new RuntimeException('ไม่สามารถสร้างโทเคนอนุมัติได้');
}

function mwl_ensure_approval_record(PDO $pdo, int $logId): array
{
    $token = mwl_generate_approval_token($pdo);
    $expiresAt = date('Y-m-d H:i:s', strtotime('+10 minutes'));
    $stmt = $pdo->prepare(
        'INSERT INTO MachineWorkLogApproval (MachineWorkLog_Id, Approval_Token, Token_Expires_At)
        VALUES (:logId, :token, :expiresAt)
        ON DUPLICATE KEY UPDATE
            Approval_Token = VALUES(Approval_Token),
            Token_Expires_At = VALUES(Token_Expires_At),
            Inspector_User_Id = NULL,
            Inspector_Approved_At = NULL,
            Inspector_Remark = NULL,
            Updated_At = CURRENT_TIMESTAMP'
    );
    $stmt->execute([
        ':logId' => $logId,
        ':token' => $token,
        ':expiresAt' => $expiresAt,
    ]);
    return [
        'token' => $token,
        'expires_at' => $expiresAt,
    ];
}

function mwl_transform_row(array $row): array
{
    if (array_key_exists('Work_Orders_JSON', $row)) {
        $decoded = json_decode((string)$row['Work_Orders_JSON'], true);
        $row['Work_Orders'] = is_array($decoded) ? array_values(array_filter($decoded, static function ($v) {
            return is_string($v) && trim($v) !== '';
        })) : [];
        unset($row['Work_Orders_JSON']);
    }
    if (array_key_exists('Checklist_JSON', $row)) {
        $decoded = json_decode((string)$row['Checklist_JSON'], true);
        $row['Checklist'] = is_array($decoded) ? $decoded : [];
        unset($row['Checklist_JSON']);
    }
    if (array_key_exists('Photo_Attachments_JSON', $row)) {
        $decoded = json_decode((string)$row['Photo_Attachments_JSON'], true);
        $row['Photo_Attachments'] = is_array($decoded) ? $decoded : [];
        unset($row['Photo_Attachments_JSON']);
    }
    if (
        array_key_exists('Approval_Token', $row)
        || array_key_exists('Token_Expires_At', $row)
        || array_key_exists('Approval_Inspector_User_Id', $row)
    ) {
        $inspectorName = mwl_compose_center_display_name(
            $row['Approval_Inspector_Username'] ?? null,
            $row['Approval_Inspector_FirstName'] ?? null,
            $row['Approval_Inspector_LastName'] ?? null
        );
        $inspectorId = array_key_exists('Approval_Inspector_User_Id', $row) && $row['Approval_Inspector_User_Id'] !== null
            ? (int)$row['Approval_Inspector_User_Id']
            : null;
        $row['Approval'] = [
            'token' => $row['Approval_Token'] ?? null,
            'expires_at' => $row['Token_Expires_At'] ?? null,
            'inspector_user_id' => $inspectorId,
            'inspector_approved_at' => $row['Approval_Inspector_Approved_At'] ?? null,
            'inspector_remark' => $row['Approval_Inspector_Remark'] ?? null,
            'inspector_name' => $inspectorName,
        ];
        unset(
            $row['Approval_Token'],
            $row['Token_Expires_At'],
            $row['Approval_Inspector_User_Id'],
            $row['Approval_Inspector_Approved_At'],
            $row['Approval_Inspector_Remark'],
            $row['Approval_Inspector_Username'],
            $row['Approval_Inspector_FirstName'],
            $row['Approval_Inspector_LastName']
        );
    }
    return $row;
}

function mwl_fetch_log(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT
            log.*,
            apr.Approval_Token,
            apr.Token_Expires_At,
            apr.Inspector_User_Id AS Approval_Inspector_User_Id,
            apr.Inspector_Approved_At AS Approval_Inspector_Approved_At,
            apr.Inspector_Remark AS Approval_Inspector_Remark,
            inspector.Username AS Approval_Inspector_Username,
            inspector.Name AS Approval_Inspector_FirstName,
            inspector.Lastname AS Approval_Inspector_LastName
        FROM MachineWorkLog log
        LEFT JOIN MachineWorkLogApproval apr ON apr.MachineWorkLog_Id = log.MachineWorkLog_Id
        LEFT JOIN Center inspector ON inspector.Center_Id = apr.Inspector_User_Id
        WHERE log.MachineWorkLog_Id = :id
        LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return mwl_transform_row($row);
}

function mwl_fetch_logs(PDO $pdo, array $filters, ?int $limit = 50): array
{
    $sql = 'SELECT
        log.*,
        log.Project_Name,
        apr.Approval_Token,
        apr.Token_Expires_At,
        apr.Inspector_User_Id AS Approval_Inspector_User_Id,
        apr.Inspector_Approved_At AS Approval_Inspector_Approved_At,
        apr.Inspector_Remark AS Approval_Inspector_Remark,
        inspector.Username AS Approval_Inspector_Username,
        inspector.Name AS Approval_Inspector_FirstName,
        inspector.Lastname AS Approval_Inspector_LastName
    FROM MachineWorkLog log
    LEFT JOIN MachineWorkLogApproval apr ON apr.MachineWorkLog_Id = log.MachineWorkLog_Id
    LEFT JOIN Center inspector ON inspector.Center_Id = apr.Inspector_User_Id
    WHERE 1=1';
    $params = [];

    if (array_key_exists('centerId', $filters) && $filters['centerId'] !== null) {
        $sql .= ' AND (log.Center_Id IS NULL OR log.Center_Id = :centerId)';
        $params[':centerId'] = (int)$filters['centerId'];
    }
    if (!empty($filters['from'])) {
        $sql .= ' AND log.Document_Date >= :fromDate';
        $from = $filters['from'];
        if (strlen((string)$from) === 10) {
            $from .= ' 00:00:00';
        }
        $params[':fromDate'] = $from;
    }
    if (!empty($filters['to'])) {
        $sql .= ' AND log.Document_Date <= :toDate';
        $to = $filters['to'];
        if (strlen((string)$to) === 10) {
            $to .= ' 23:59:59';
        }
        $params[':toDate'] = $to;
    }
    if (!empty($filters['date'])) {
        $sql .= ' AND DATE(log.Document_Date) = :exactDate';
        $params[':exactDate'] = $filters['date'];
    }
    if (!empty($filters['search'])) {
        $sql .= ' AND (
            log.Machine_Code LIKE :search
            OR log.Machine_Name LIKE :search
            OR log.Machine_Description LIKE :search
            OR log.Work_Order LIKE :search
            OR log.Project_Name LIKE :search
            OR log.Operation_Details LIKE :search
            OR log.Created_By LIKE :search
        )';
        $params[':search'] = '%' . $filters['search'] . '%';
    }

    $sql .= ' ORDER BY log.Document_Date DESC, log.MachineWorkLog_Id DESC';
    if ($limit !== null) {
        $sql .= ' LIMIT ' . (int)max(1, min($limit, 500));
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    return array_map('mwl_transform_row', $rows);
}

function handle_machine_work_log_get(): void
{
    $user = require_auth();
    try {
        $pdo = db_connection();
        if (isset($_GET['id'])) {
            $id = (int)$_GET['id'];
            $item = mwl_fetch_log($pdo, $id);
            if (!$item) {
                respond_json(['error' => 'ไม่พบข้อมูล'], 404);
                return;
            }
            respond_json(['item' => $item]);
            return;
        }

        $isAdmin = user_has_role($user, 'admin');
        $centerFilter = null;
        if ($isAdmin) {
            if (isset($_GET['centerId']) && $_GET['centerId'] !== '') {
                $centerFilter = (int)$_GET['centerId'];
            }
        } else {
            $centerFilter = isset($user['Center_Id']) ? (int)$user['Center_Id'] : null;
        }

        $filters = [
            'centerId' => $centerFilter,
            'from' => mwl_normalize_date($_GET['from'] ?? null),
            'to' => mwl_normalize_date($_GET['to'] ?? null),
            'date' => mwl_normalize_date($_GET['date'] ?? null),
            'search' => mwl_normalize_string($_GET['search'] ?? null, 100),
        ];
        $limit = isset($_GET['limit']) ? max(1, min((int)$_GET['limit'], 500)) : 50;
        $items = mwl_fetch_logs($pdo, $filters, $limit);

        $totalHours = 0.0;
        foreach ($items as $row) {
            $totalHours += (float)($row['Work_Meter_Total'] ?? 0);
        }

        respond_json([
            'items' => $items,
            'summary' => [
                'count' => count($items),
                'total_work_meter' => round($totalHours, 2),
            ],
        ]);
    } catch (Throwable $e) {
        respond_json(['error' => $e->getMessage()], 500);
    }
}

function handle_machine_work_log_post(): void
{
    $user = require_auth();
    $payload = null;
    $raw = file_get_contents('php://input');
    if (is_string($raw) && trim($raw) !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $payload = $decoded;
        }
    }
    if ($payload === null && isset($_POST['payload'])) {
        $decoded = json_decode((string)$_POST['payload'], true);
        if (is_array($decoded)) {
            $payload = $decoded;
        }
    }
    if ($payload === null && is_array($_POST) && !empty($_POST)) {
        $payload = $_POST;
    }
    if (!is_array($payload)) {
        $payload = [];
    }

    $documentDate = mwl_normalize_datetime($payload['documentDate'] ?? date('Y-m-d H:i:s'));
    $workOrders = mwl_normalize_work_orders($payload['workOrders'] ?? ($payload['workOrder'] ?? []));
    $workOrder = $workOrders[0] ?? mwl_normalize_string($payload['workOrder'] ?? null, 100);
    $projectName = mwl_normalize_string($payload['projectName'] ?? null, 255);
    $machineCode = mwl_normalize_string($payload['machineCode'] ?? null, 50);
    $machineName = mwl_normalize_string($payload['machineName'] ?? null, 120);
    $machineDescription = mwl_normalize_string($payload['machineDescription'] ?? null, 255);
    $operationDetails = mwl_normalize_text($payload['operationDetails'] ?? null, 2000);
    $meterHour = mwl_normalize_decimal($payload['meterHour'] ?? null);
    $odometer = mwl_normalize_decimal($payload['odometer'] ?? null);
    $workMeterStart = mwl_normalize_decimal($payload['workMeterStart'] ?? null);
    $workMeterEnd = mwl_normalize_decimal($payload['workMeterEnd'] ?? null);
    $workMeterTotal = mwl_normalize_decimal($payload['workMeterTotal'] ?? null);
    $timeMorningStart = mwl_normalize_time($payload['timeMorningStart'] ?? null);
    $timeMorningEnd = mwl_normalize_time($payload['timeMorningEnd'] ?? null);
    $timeMorningTotal = mwl_normalize_decimal($payload['timeMorningTotal'] ?? null);
    $timeAfternoonStart = mwl_normalize_time($payload['timeAfternoonStart'] ?? null);
    $timeAfternoonEnd = mwl_normalize_time($payload['timeAfternoonEnd'] ?? null);
    $timeAfternoonTotal = mwl_normalize_decimal($payload['timeAfternoonTotal'] ?? null);
    $timeOtStart = mwl_normalize_time($payload['timeOtStart'] ?? null);
    $timeOtEnd = mwl_normalize_time($payload['timeOtEnd'] ?? null);
    $timeOtTotal = mwl_normalize_decimal($payload['timeOtTotal'] ?? null);
    $operatorAccountId = isset($payload['operatorAccountId']) ? (int)$payload['operatorAccountId'] : null;
    if ($operatorAccountId !== null && $operatorAccountId <= 0) {
        $operatorAccountId = null;
    }
    $operatorName = mwl_normalize_string($payload['operatorName'] ?? null, 120);
    $checklistOtherNote = mwl_normalize_text($payload['checklistOtherNote'] ?? null, 500);
    $documentNo = mwl_normalize_string($payload['documentNo'] ?? null, 50);

    if ($documentDate === null) {
        respond_json(['error' => 'กรุณาระบุวันที่บันทึก'], 422);
        return;
    }
    if ($machineCode === null) {
        respond_json(['error' => 'กรุณาระบุรหัสเครื่องจักร'], 422);
        return;
    }

    $sessionOperatorId = isset($user['Center_Id']) ? (int)$user['Center_Id'] : null;
    $sessionHasOperatorRole = user_has_role($user, 'operator') || user_has_role($user, 'driver');
    $requiresOperatorLookup = false;

    if ($sessionHasOperatorRole && $sessionOperatorId !== null) {
        if ($operatorAccountId !== null && $operatorAccountId !== $sessionOperatorId) {
            respond_json(['error' => 'ข้อมูลพนักงานขับไม่ตรงกับผู้ที่เข้าสู่ระบบ'], 422);
            return;
        }
        $operatorAccountId = $sessionOperatorId;
        $resolvedName = mwl_resolve_session_display_name($user);
        if ($resolvedName !== null) {
            $operatorName = $resolvedName;
        }
    } else {
        $requiresOperatorLookup = true;
        if ($operatorAccountId === null) {
            respond_json(['error' => 'กรุณาเลือกพนักงานขับรถ'], 422);
            return;
        }
    }

    if ($operatorName === null || $operatorName === '') {
        respond_json(['error' => 'ไม่สามารถระบุชื่อพนักงานขับได้'], 422);
        return;
    }

    if ($workMeterTotal === null && $workMeterStart !== null && $workMeterEnd !== null) {
        $workMeterTotal = round($workMeterEnd - $workMeterStart, 2);
    }
    $autoMorningTotal = mwl_diff_time_hours($timeMorningStart, $timeMorningEnd);
    if ($timeMorningTotal === null && $autoMorningTotal !== null) {
        $timeMorningTotal = $autoMorningTotal;
    }
    $autoAfternoonTotal = mwl_diff_time_hours($timeAfternoonStart, $timeAfternoonEnd);
    if ($timeAfternoonTotal === null && $autoAfternoonTotal !== null) {
        $timeAfternoonTotal = $autoAfternoonTotal;
    }
    $autoOtTotal = mwl_diff_time_hours($timeOtStart, $timeOtEnd);
    if ($timeOtTotal === null && $autoOtTotal !== null) {
        $timeOtTotal = $autoOtTotal;
    }

    $workOrdersJson = null;
    if (!empty($workOrders)) {
        $workOrdersJson = json_encode($workOrders, JSON_UNESCAPED_UNICODE);
    }

    $checklistJson = null;
    $rawChecklist = isset($payload['checklist']) && is_array($payload['checklist']) ? $payload['checklist'] : [];
    $normalizedChecklist = [];
    foreach ($rawChecklist as $key => $value) {
        $normalizedChecklist[$key] = mwl_normalize_string($value ?? null, 50) ?? '';
    }
    if (!empty($normalizedChecklist) || ($checklistOtherNote !== null && $checklistOtherNote !== '')) {
        $checklistPayload = [
            'items' => $normalizedChecklist,
            'otherNote' => $checklistOtherNote,
        ];
        $checklistJson = json_encode($checklistPayload, JSON_UNESCAPED_UNICODE);
    }

    try {
        $pdo = db_connection();
        if ($requiresOperatorLookup && $operatorAccountId !== null) {
            $driverRow = mwl_fetch_center_user_by_id($pdo, $operatorAccountId);
            if (!$driverRow) {
                respond_json(['error' => 'ไม่พบข้อมูลพนักงานขับรถ'], 422);
                return;
            }
            $driverRoles = resolve_user_roles($driverRow['Role'] ?? null);
            $allowed = false;
            foreach (['operator', 'driver'] as $allowedRole) {
                if (in_array($allowedRole, $driverRoles, true)) {
                    $allowed = true;
                    break;
                }
            }
            if (!$allowed) {
                respond_json(['error' => 'บัญชีที่เลือกไม่ใช่พนักงานขับรถ'], 422);
                return;
            }
            $driverName = trim(sprintf('%s %s', (string)($driverRow['Name'] ?? ''), (string)($driverRow['Lastname'] ?? '')));
            if ($driverName === '') {
                $driverName = (string)($driverRow['Username'] ?? '');
            }
            if ($driverName === '') {
                respond_json(['error' => 'ไม่สามารถระบุชื่อพนักงานขับได้'], 422);
                return;
            }
            $operatorName = $driverName;
        }

        $stmt = $pdo->prepare('INSERT INTO MachineWorkLog (
            Center_Id,
            Document_No,
            Document_Date,
            Work_Order,
            Project_Name,
            Work_Orders_JSON,
            Machine_Code,
            Machine_Name,
            Machine_Description,
            Operation_Details,
            Meter_Hour,
            Odometer,
            Work_Meter_Start,
            Work_Meter_End,
            Work_Meter_Total,
            Time_Morning_Start,
            Time_Morning_End,
            Time_Morning_Total,
            Time_Afternoon_Start,
            Time_Afternoon_End,
            Time_Afternoon_Total,
            Time_Ot_Start,
            Time_Ot_End,
            Time_Ot_Total,
            Checklist_JSON,
            Created_By
        ) VALUES (
            :center_id,
            :document_no,
            :document_date,
            :work_order,
            :project_name,
            :work_orders_json,
            :machine_code,
            :machine_name,
            :machine_description,
            :operation_details,
            :meter_hour,
            :odometer,
            :work_meter_start,
            :work_meter_end,
            :work_meter_total,
            :time_morning_start,
            :time_morning_end,
            :time_morning_total,
            :time_afternoon_start,
            :time_afternoon_end,
            :time_afternoon_total,
            :time_ot_start,
            :time_ot_end,
            :time_ot_total,
            :checklist_json,
            :created_by
        )');
        $stmt->execute([
            ':center_id' => $user['Center_Id'] ?? null,
            ':document_no' => $documentNo,
            ':document_date' => $documentDate,
            ':work_order' => $workOrder,
            ':project_name' => $projectName,
            ':work_orders_json' => $workOrdersJson,
            ':machine_code' => $machineCode,
            ':machine_name' => $machineName,
            ':machine_description' => $machineDescription,
            ':operation_details' => $operationDetails,
            ':meter_hour' => $meterHour,
            ':odometer' => $odometer,
            ':work_meter_start' => $workMeterStart,
            ':work_meter_end' => $workMeterEnd,
            ':work_meter_total' => $workMeterTotal,
            ':time_morning_start' => $timeMorningStart,
            ':time_morning_end' => $timeMorningEnd,
            ':time_morning_total' => $timeMorningTotal,
            ':time_afternoon_start' => $timeAfternoonStart,
            ':time_afternoon_end' => $timeAfternoonEnd,
            ':time_afternoon_total' => $timeAfternoonTotal,
            ':time_ot_start' => $timeOtStart,
            ':time_ot_end' => $timeOtEnd,
            ':time_ot_total' => $timeOtTotal,
            ':checklist_json' => $checklistJson,
            ':created_by' => $user['displayName'] ?? ($user['Username'] ?? null),
        ]);

        $id = (int)$pdo->lastInsertId();
        if ($documentNo === null || $documentNo === '') {
            $autoDoc = sprintf('MWL-%s-%05d', date('Ymd', strtotime($documentDate)), $id);
            $upd = $pdo->prepare('UPDATE MachineWorkLog SET Document_No = :doc WHERE MachineWorkLog_Id = :id');
            $upd->execute([':doc' => $autoDoc, ':id' => $id]);
        }

        $approvalSeed = mwl_ensure_approval_record($pdo, $id);

        $item = mwl_fetch_log($pdo, $id);
        $approvalMeta = isset($item['Approval']) && is_array($item['Approval']) ? $item['Approval'] : null;
        $approvalStatus = null;
        if ($approvalMeta !== null) {
            $approvalStatus = [
                'inspectorName' => $approvalMeta['inspector_name'] ?? '',
                'inspectorDone' => !empty($approvalMeta['inspector_approved_at']),
            ];
        }

        $approvalPayload = [
            'token' => $approvalSeed['token'],
            'expires_at' => $approvalSeed['expires_at'],
            'path' => sprintf('#/machine-work-approval?machineWorkLogId=%d&token=%s', $id, $approvalSeed['token']),
        ];
        $approvalPayload['url'] = $approvalPayload['path'];

        respond_json([
            'item' => $item,
            'approval' => $approvalPayload,
            'approvalStatus' => $approvalStatus,
        ], 201);
    } catch (Throwable $e) {
        respond_json(['error' => $e->getMessage()], 500);
    }}


function handle_machine_work_log_request(): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        handle_machine_work_log_get();
        return;
    }
    if ($method === 'POST') {
        handle_machine_work_log_post();
        return;
    }
    respond_json(['error' => 'Method not allowed'], 405);
}

if (php_sapi_name() !== 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    handle_machine_work_log_request();
}
