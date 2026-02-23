<?php
declare(strict_types=1);

require_once __DIR__ . '/server.php';
require_once __DIR__ . '/auth.php';

const OIL_CHECKLIST_OTHER_ID = 'other';
const CHECKLIST_OTHER_NOTE_KEY = 'other_note';
const OILLOG_MAX_ATTACHMENTS = 5;
const OILLOG_MAX_ATTACHMENT_SIZE = 8 * 1024 * 1024;
const OILLOG_ALLOWED_ATTACHMENT_MIME = [
    'image/jpeg',
    'image/pjpeg',
    'image/jpg',
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

function normalize_string($value, int $maxLen = 255): ?string
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

function normalize_text($value, int $maxLen = 2000): ?string
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

function normalize_datetime($value): ?string
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

function normalize_date($value): ?string
{
    $normalized = normalize_datetime($value);
    if ($normalized === null) {
        return null;
    }
    return substr($normalized, 0, 10);
}

function normalize_time($value): ?string
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

function normalize_decimal($value): ?float
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

function compose_center_display_name(?string $username, ?string $firstName, ?string $lastName): ?string
{
    $full = trim(sprintf('%s %s', (string)$firstName, (string)$lastName));
    if ($full !== '') {
        return $full;
    }
    $username = trim((string)$username);
    return $username !== '' ? $username : null;
}

function resolve_session_display_name(array $user): ?string
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
        return (string)$user['Username'];
    }
    return null;
}

function generate_oillog_approval_token(PDO $pdo): string
{
    for ($i = 0; $i < 6; $i++) {
        $candidate = bin2hex(random_bytes(20));
        $stmt = $pdo->prepare('SELECT Approval_Id FROM OilLogApproval WHERE Approval_Token = :token LIMIT 1');
        $stmt->execute([':token' => $candidate]);
        if ($stmt->fetch() === false) {
            return $candidate;
        }
    }
    throw new RuntimeException('ไม่สามารถสร้างโทเคนอนุมัติได้');
}

function resolve_machine_work_log_id_for_oillog(PDO $pdo, int $oilLogId): ?int
{
    $stmt = $pdo->prepare('SELECT Machine_Code, Document_Date FROM OilLog WHERE OilLog_Id = :id LIMIT 1');
    $stmt->execute([':id' => $oilLogId]);
    $logRow = $stmt->fetch();
    if (!$logRow) {
        return null;
    }
    $machineCode = trim((string)($logRow['Machine_Code'] ?? ''));
    $documentDate = $logRow['Document_Date'] ?? null;
    if ($machineCode === '' || $documentDate === null) {
        return null;
    }
    $stmt = $pdo->prepare(
        'SELECT mwl.MachineWorkLog_Id
        FROM MachineWorkLog mwl
        WHERE mwl.Machine_Code = :machineCode
            AND DATE(mwl.Document_Date) = DATE(:documentDate)
        ORDER BY mwl.MachineWorkLog_Id DESC
        LIMIT 1'
    );
    $stmt->execute([
        ':machineCode' => $machineCode,
        ':documentDate' => $documentDate,
    ]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return (int)$row['MachineWorkLog_Id'];
}

function ensure_oillog_approval_record(PDO $pdo, int $oilLogId, ?int $machineWorkLogId = null): array
{
    $token = generate_oillog_approval_token($pdo);
    $expiresAt = date('Y-m-d H:i:s', strtotime('+10 minutes'));
    $stmt = $pdo->prepare(
        'INSERT INTO OilLogApproval (OilLog_Id, MachineWorkLog_Id, Approval_Token, Token_Expires_At)
        VALUES (:oilLogId, :machineWorkLogId, :token, :expires)
        ON DUPLICATE KEY UPDATE
            Approval_Token = VALUES(Approval_Token),
            Token_Expires_At = VALUES(Token_Expires_At),
            MachineWorkLog_Id = COALESCE(VALUES(MachineWorkLog_Id), MachineWorkLog_Id),
            Oiler_User_Id = NULL,
            Oiler_Approved_At = NULL,
            Oiler_Remark = NULL,
            Updated_At = CURRENT_TIMESTAMP'
    );
    $stmt->execute([
        ':oilLogId' => $oilLogId,
        ':machineWorkLogId' => $machineWorkLogId,
        ':token' => $token,
        ':expires' => $expiresAt,
    ]);
    return [
        'token' => $token,
        'expires_at' => $expiresAt,
    ];
}

function fetch_center_user_by_id(PDO $pdo, int $centerId): ?array
{
    $stmt = $pdo->prepare('SELECT Center_Id, Username, Name, Lastname, `Role` FROM Center WHERE Center_Id = :id LIMIT 1');
    $stmt->execute([':id' => $centerId]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function time_to_seconds(?string $time): ?int
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

function diff_time_hours(?string $start, ?string $end): ?float
{
    $startSeconds = time_to_seconds($start);
    $endSeconds = time_to_seconds($end);
    if ($startSeconds === null || $endSeconds === null) {
        return null;
    }
    $diff = $endSeconds - $startSeconds;
    if ($diff < 0) {
        $diff += 86400; // handle overnight spans
    }
    return round($diff / 3600, 2);
}

function gather_oillog_photo_uploads(string $fieldName, ?string &$errorMessage): array
{
    $errorMessage = null;
    $files = $_FILES[$fieldName] ?? null;
    if ($files === null) {
        $altKey = $fieldName === 'attachments' ? 'attachments[]' : null;
        if ($altKey !== null && isset($_FILES[$altKey])) {
            $files = $_FILES[$altKey];
        } else {
            return [];
        }
    }
    if (!is_array($files['name'])) {
        $errorMessage = 'ไม่สามารถอ่านไฟล์แนบได้';
        return [];
    }
    $count = count($files['name']);
    if ($count === 0) {
        return [];
    }
    if ($count > OILLOG_MAX_ATTACHMENTS) {
        $errorMessage = sprintf('แนบรูปได้สูงสุด %d รูปต่อใบงาน', OILLOG_MAX_ATTACHMENTS);
        return [];
    }
    $collected = [];
    for ($i = 0; $i < $count; $i++) {
        $errorCode = (int)($files['error'][$i] ?? UPLOAD_ERR_NO_FILE);
        if ($errorCode !== UPLOAD_ERR_OK) {
            $errorMessage = 'ไฟล์บางไฟล์อัปโหลดไม่สำเร็จ กรุณาลองใหม่';
            return [];
        }
        $tmp = $files['tmp_name'][$i] ?? null;
        if ($tmp === null || !is_uploaded_file($tmp)) {
            $errorMessage = 'ไฟล์บางไฟล์อัปโหลดไม่สำเร็จ กรุณาลองใหม่';
            return [];
        }
        $size = (int)($files['size'][$i] ?? 0);
        if ($size <= 0 || $size > OILLOG_MAX_ATTACHMENT_SIZE) {
            $name = (string)($files['name'][$i] ?? 'ไฟล์');
            $maxMb = (int)round(OILLOG_MAX_ATTACHMENT_SIZE / 1048576);
            $errorMessage = sprintf('ไฟล์ %s มีขนาดเกิน %dMB', $name, $maxMb);
            return [];
        }
        $type = strtolower((string)($files['type'][$i] ?? ''));
        if ($type === 'image/pjpeg' || $type === 'image/jpg') {
            $type = 'image/jpeg';
        }
        if ($type !== '' && !in_array($type, OILLOG_ALLOWED_ATTACHMENT_MIME, true)) {
            $errorMessage = 'รองรับเฉพาะไฟล์ JPG เท่านั้น';
            return [];
        }
        $orig = (string)($files['name'][$i] ?? ('photo-' . ($i + 1)));
        $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
        if ($ext === '' || !in_array($ext, ['jpg', 'jpeg'], true)) {
            $errorMessage = 'กรุณาใช้ไฟล์สกุล .jpg เท่านั้น';
            return [];
        }
        $collected[] = [
            'tmp' => $tmp,
            'orig' => $orig,
            'ext' => $ext === 'jpeg' ? 'jpg' : $ext,
        ];
    }
    return $collected;
}

function persist_oillog_photos(array $files, int $oilLogId): array
{
    if (empty($files)) {
        return [];
    }
    $uploadsRoot = realpath(__DIR__ . '/../uploads');
    if ($uploadsRoot === false) {
        $uploadsRoot = __DIR__ . '/../uploads';
    }
    if (!is_dir($uploadsRoot)) {
        mkdir($uploadsRoot, 0755, true);
    }
    $baseDir = $uploadsRoot . '/oillogs';
    if (!is_dir($baseDir)) {
        mkdir($baseDir, 0755, true);
    }
    $logDir = $baseDir . '/log' . $oilLogId;
    if (!is_dir($logDir)) {
        mkdir($logDir, 0755, true);
    }
    $saved = [];
    foreach ($files as $file) {
        $safeBase = sanitize_filename(pathinfo($file['orig'], PATHINFO_FILENAME));
        if ($safeBase === '') {
            $safeBase = 'photo';
        }
        $final = sprintf('%s_%s.%s', $safeBase, bin2hex(random_bytes(6)), $file['ext']);
        $dest = $logDir . '/' . $final;
        if (!move_uploaded_file($file['tmp'], $dest)) {
            continue;
        }
        $saved[] = [
            'name' => $file['orig'],
            'path' => '/uploads/oillogs/log' . $oilLogId . '/' . $final,
        ];
    }
    return $saved;
}

function transform_oillog_row(array $row): array
{
    if (array_key_exists('Checklist_JSON', $row)) {
        $decoded = json_decode((string)$row['Checklist_JSON'], true);
        $row['Checklist'] = is_array($decoded) ? $decoded : [];
        unset($row['Checklist_JSON']);
    }
    if (array_key_exists('Fuel_Details_JSON', $row)) {
        $decoded = json_decode((string)$row['Fuel_Details_JSON'], true);
        $row['Fuel_Details'] = is_array($decoded) ? $decoded : [];
        unset($row['Fuel_Details_JSON']);
    }
    if (array_key_exists('Photo_Attachments_JSON', $row)) {
        $decoded = json_decode((string)$row['Photo_Attachments_JSON'], true);
        $row['Photo_Attachments'] = is_array($decoded) ? $decoded : [];
        unset($row['Photo_Attachments_JSON']);
    }
    if (array_key_exists('MWL_Checklist_JSON', $row)) {
        $decoded = json_decode((string)$row['MWL_Checklist_JSON'], true);
        $row['MWL_Checklist'] = is_array($decoded) ? $decoded : [];
        unset($row['MWL_Checklist_JSON']);
    }
    if (
        (!isset($row['Checklist']) || (is_array($row['Checklist']) && count($row['Checklist']) === 0))
        && isset($row['MWL_Checklist'])
        && is_array($row['MWL_Checklist'])
        && count($row['MWL_Checklist']) > 0
    ) {
        $row['Checklist'] = $row['MWL_Checklist'];
    }
    if (array_key_exists('MWL_Work_Orders_JSON', $row)) {
        $decoded = json_decode((string)$row['MWL_Work_Orders_JSON'], true);
        $row['MWL_Work_Orders'] = is_array($decoded) ? $decoded : [];
        unset($row['MWL_Work_Orders_JSON']);
    }
    if (
        array_key_exists('Approval_Oiler_Username', $row)
        || array_key_exists('Approval_Oiler_FirstName', $row)
        || array_key_exists('Approval_Oiler_LastName', $row)
    ) {
        $row['Approval_Oiler_Name'] = compose_center_display_name(
            $row['Approval_Oiler_Username'] ?? null,
            $row['Approval_Oiler_FirstName'] ?? null,
            $row['Approval_Oiler_LastName'] ?? null
        );
        unset($row['Approval_Oiler_Username'], $row['Approval_Oiler_FirstName'], $row['Approval_Oiler_LastName']);
    }
    if (
        array_key_exists('Approval_Inspector_Username', $row)
        || array_key_exists('Approval_Inspector_FirstName', $row)
        || array_key_exists('Approval_Inspector_LastName', $row)
    ) {
        $row['Approval_Inspector_Name'] = compose_center_display_name(
            $row['Approval_Inspector_Username'] ?? null,
            $row['Approval_Inspector_FirstName'] ?? null,
            $row['Approval_Inspector_LastName'] ?? null
        );
        unset($row['Approval_Inspector_Username'], $row['Approval_Inspector_FirstName'], $row['Approval_Inspector_LastName']);
    }
    if (
        array_key_exists('MWL_Inspector_Username', $row)
        || array_key_exists('MWL_Inspector_FirstName', $row)
        || array_key_exists('MWL_Inspector_LastName', $row)
    ) {
        $row['MWL_Inspector_Name'] = compose_center_display_name(
            $row['MWL_Inspector_Username'] ?? null,
            $row['MWL_Inspector_FirstName'] ?? null,
            $row['MWL_Inspector_LastName'] ?? null
        );
        unset($row['MWL_Inspector_Username'], $row['MWL_Inspector_FirstName'], $row['MWL_Inspector_LastName']);
    }
    if (
        (!isset($row['Approval_Inspector_Name']) || $row['Approval_Inspector_Name'] === null || $row['Approval_Inspector_Name'] === '')
        && !empty($row['MWL_Inspector_Name'] ?? '')
    ) {
        $row['Approval_Inspector_Name'] = $row['MWL_Inspector_Name'];
    }
    return $row;
}

function fetch_oillog(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare(
        'SELECT log.*,
            apr.Oiler_User_Id AS Approval_Oiler_User_Id,
            apr.Oiler_Approved_At AS Approval_Oiler_Approved_At,
            apr.Oiler_Remark AS Approval_Oiler_Remark,
            mwlapr.Inspector_User_Id AS Approval_Inspector_User_Id,
            mwlapr.Inspector_Approved_At AS Approval_Inspector_Approved_At,
            mwlapr.Inspector_Remark AS Approval_Inspector_Remark,
            oiler.Username AS Approval_Oiler_Username,
            oiler.Name AS Approval_Oiler_FirstName,
            oiler.Lastname AS Approval_Oiler_LastName,
            mwlInspector.Username AS Approval_Inspector_Username,
            mwlInspector.Name AS Approval_Inspector_FirstName,
            mwlInspector.Lastname AS Approval_Inspector_LastName,
            mwl.MachineWorkLog_Id AS MWL_Id,
            mwl.Document_No AS MWL_Document_No,
            mwl.Meter_Hour AS MWL_Meter_Hour,
            mwl.Odometer AS MWL_Odometer,
            mwl.Project_Name AS MWL_Project_Name,
            mwl.Work_Meter_Start AS MWL_Work_Meter_Start,
            mwl.Work_Meter_End AS MWL_Work_Meter_End,
            mwl.Work_Meter_Total AS MWL_Work_Meter_Total,
            mwl.Work_Order AS MWL_Work_Order,
            mwl.Work_Orders_JSON AS MWL_Work_Orders_JSON,
            mwl.Time_Morning_Start AS MWL_Time_Morning_Start,
            mwl.Time_Morning_End AS MWL_Time_Morning_End,
            mwl.Time_Morning_Total AS MWL_Time_Morning_Total,
            mwl.Time_Afternoon_Start AS MWL_Time_Afternoon_Start,
            mwl.Time_Afternoon_End AS MWL_Time_Afternoon_End,
            mwl.Time_Afternoon_Total AS MWL_Time_Afternoon_Total,
            mwl.Time_Ot_Start AS MWL_Time_Ot_Start,
            mwl.Time_Ot_End AS MWL_Time_Ot_End,
            mwl.Time_Ot_Total AS MWL_Time_Ot_Total,
            mwl.Operation_Details AS MWL_Operation_Details,
            mwl.Checklist_JSON AS MWL_Checklist_JSON,
            mwlapr.Inspector_User_Id AS MWL_Inspector_User_Id,
            mwlapr.Inspector_Approved_At AS MWL_Inspector_Approved_At,
            mwlapr.Inspector_Remark AS MWL_Inspector_Remark,
            mwlInspector.Username AS MWL_Inspector_Username,
            mwlInspector.Name AS MWL_Inspector_FirstName,
            mwlInspector.Lastname AS MWL_Inspector_LastName
        FROM OilLog log
        LEFT JOIN MachineWorkLog mwl ON mwl.MachineWorkLog_Id = (
            SELECT mwl2.MachineWorkLog_Id FROM MachineWorkLog mwl2
            WHERE mwl2.Machine_Code = log.Machine_Code
                AND DATE(mwl2.Document_Date) = DATE(log.Document_Date)
            ORDER BY mwl2.MachineWorkLog_Id DESC
            LIMIT 1
        )
        LEFT JOIN OilLogApproval apr ON apr.OilLog_Id = log.OilLog_Id
        LEFT JOIN Center oiler ON oiler.Center_Id = apr.Oiler_User_Id
        LEFT JOIN MachineWorkLogApproval mwlapr ON mwlapr.MachineWorkLog_Id = mwl.MachineWorkLog_Id
        LEFT JOIN Center mwlInspector ON mwlInspector.Center_Id = mwlapr.Inspector_User_Id
        WHERE log.OilLog_Id = :id
        LIMIT 1'
    );
    $stmt->execute([':id' => $id]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    return transform_oillog_row($row);
}

function fetch_oillogs(PDO $pdo, array $filters, ?int $limit = 50): array
{
    $sql = 'SELECT
        log.OilLog_Id,
        log.Document_No,
        log.Document_Date,
        log.Work_Order,
        log.Project_Name,
        log.Location_Name,
        log.Requester_Name,
        log.Machine_Code,
        log.Machine_Name,
        log.Machine_Description,
        log.Operation_Details,
        log.Fuel_Type,
        log.Fuel_Amount_Liters,
        log.Fuel_Details_JSON,
        log.Photo_Attachments_JSON,
        log.Fuel_Ticket_No,
        log.Tank_Before_Liters,
        log.Tank_After_Liters,
        log.Meter_Hour_Start,
        log.Meter_Hour_End,
        log.Odometer_Start,
        log.Odometer_End,
        log.Work_Meter_Start,
        log.Work_Meter_End,
        log.Work_Meter_Total,
        log.Time_Morning_Start,
        log.Time_Morning_End,
        log.Time_Morning_Total,
        log.Time_Afternoon_Start,
        log.Time_Afternoon_End,
        log.Time_Afternoon_Total,
        log.Time_Ot_Start,
        log.Time_Ot_End,
        log.Time_Ot_Total,
        log.Fuel_Time,
        log.Operator_Name,
        log.Assistant_Name,
        log.Recorder_Name,
        log.Notes,
        log.Checklist_JSON,
        log.Created_By,
        log.Created_At,
        apr.Oiler_User_Id AS Approval_Oiler_User_Id,
        apr.Oiler_Approved_At AS Approval_Oiler_Approved_At,
        apr.Oiler_Remark AS Approval_Oiler_Remark,
        mwlapr.Inspector_User_Id AS Approval_Inspector_User_Id,
        mwlapr.Inspector_Approved_At AS Approval_Inspector_Approved_At,
        mwlapr.Inspector_Remark AS Approval_Inspector_Remark,
        oiler.Username AS Approval_Oiler_Username,
        oiler.Name AS Approval_Oiler_FirstName,
        oiler.Lastname AS Approval_Oiler_LastName,
        mwlInspector.Username AS Approval_Inspector_Username,
        mwlInspector.Name AS Approval_Inspector_FirstName,
        mwlInspector.Lastname AS Approval_Inspector_LastName,
        mwl.MachineWorkLog_Id AS MWL_Id,
        mwl.Document_No AS MWL_Document_No,
        mwl.Meter_Hour AS MWL_Meter_Hour,
        mwl.Odometer AS MWL_Odometer,
        mwl.Work_Meter_Start AS MWL_Work_Meter_Start,
        mwl.Work_Meter_End AS MWL_Work_Meter_End,
        mwl.Work_Meter_Total AS MWL_Work_Meter_Total,
        mwl.Work_Order AS MWL_Work_Order,
        mwl.Work_Orders_JSON AS MWL_Work_Orders_JSON,
        mwl.Time_Morning_Start AS MWL_Time_Morning_Start,
        mwl.Time_Morning_End AS MWL_Time_Morning_End,
        mwl.Time_Morning_Total AS MWL_Time_Morning_Total,
        mwl.Time_Afternoon_Start AS MWL_Time_Afternoon_Start,
        mwl.Time_Afternoon_End AS MWL_Time_Afternoon_End,
        mwl.Time_Afternoon_Total AS MWL_Time_Afternoon_Total,
        mwl.Time_Ot_Start AS MWL_Time_Ot_Start,
        mwl.Time_Ot_End AS MWL_Time_Ot_End,
        mwl.Time_Ot_Total AS MWL_Time_Ot_Total,
        mwl.Operation_Details AS MWL_Operation_Details,
        mwl.Checklist_JSON AS MWL_Checklist_JSON,
        mwlapr.Inspector_User_Id AS MWL_Inspector_User_Id,
        mwlapr.Inspector_Approved_At AS MWL_Inspector_Approved_At,
        mwlapr.Inspector_Remark AS MWL_Inspector_Remark,
        mwlInspector.Username AS MWL_Inspector_Username,
        mwlInspector.Name AS MWL_Inspector_FirstName,
        mwlInspector.Lastname AS MWL_Inspector_LastName
    FROM OilLog log
    LEFT JOIN MachineWorkLog mwl ON mwl.MachineWorkLog_Id = (
            SELECT mwl2.MachineWorkLog_Id FROM MachineWorkLog mwl2
            WHERE mwl2.Machine_Code = log.Machine_Code
                AND DATE(mwl2.Document_Date) = DATE(log.Document_Date)
            ORDER BY mwl2.MachineWorkLog_Id DESC
            LIMIT 1
    )
    LEFT JOIN OilLogApproval apr ON apr.OilLog_Id = log.OilLog_Id
    LEFT JOIN Center oiler ON oiler.Center_Id = apr.Oiler_User_Id
    LEFT JOIN MachineWorkLogApproval mwlapr ON mwlapr.MachineWorkLog_Id = mwl.MachineWorkLog_Id
    LEFT JOIN Center mwlInspector ON mwlInspector.Center_Id = mwlapr.Inspector_User_Id
    WHERE 1=1';
    $params = [];

    if (array_key_exists('centerId', $filters) && $filters['centerId'] !== null) {
        $sql .= ' AND (log.Center_Id IS NULL OR log.Center_Id = :centerId)';
        $params[':centerId'] = (int)$filters['centerId'];
    }
    if (!empty($filters['from'])) {
        $sql .= ' AND log.Document_Date >= :fromDate';
        $from = $filters['from'];
        if (strlen($from) === 10) {
            $from .= ' 00:00:00';
        }
        $params[':fromDate'] = $from;
    }
    if (!empty($filters['to'])) {
        $sql .= ' AND log.Document_Date <= :toDate';
        $to = $filters['to'];
        if (strlen($to) === 10) {
            $to .= ' 23:59:59';
        }
        $params[':toDate'] = $to;
    }
    if (!empty($filters['date'])) {
        $sql .= ' AND DATE(log.Document_Date) = :exactDate';
        $params[':exactDate'] = $filters['date'];
    }
    if (!empty($filters['fuelType'])) {
        $sql .= ' AND log.Fuel_Type = :fuelType';
        $params[':fuelType'] = $filters['fuelType'];
    }
    if (!empty($filters['search'])) {
        $sql .= ' AND (
            log.Machine_Code LIKE :search
            OR log.Machine_Name LIKE :search
            OR log.Project_Name LIKE :search
            OR log.Work_Order LIKE :search
            OR log.Operator_Name LIKE :search
            OR log.Requester_Name LIKE :search
            OR log.Assistant_Name LIKE :search
        )';
        $params[':search'] = '%' . $filters['search'] . '%';
    }

    $sql .= ' ORDER BY log.Document_Date DESC, log.OilLog_Id DESC';
    if ($limit !== null) {
        $sql .= ' LIMIT ' . (int)max(1, min($limit, 1000));
    }

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    return array_map('transform_oillog_row', $rows);
}

function handle_oillog_get(): void
{
    $user = require_auth();
    try {
        $pdo = db_connection();
        if (isset($_GET['id'])) {
            $id = (int)$_GET['id'];
            $item = fetch_oillog($pdo, $id);
            if (!$item) {
                respond_json(['error' => 'Not found'], 404);
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
            'from' => normalize_date($_GET['from'] ?? null),
            'to' => normalize_date($_GET['to'] ?? null),
            'date' => normalize_date($_GET['date'] ?? null),
            'fuelType' => normalize_string($_GET['fuelType'] ?? null, 50),
            'search' => normalize_string($_GET['search'] ?? null, 100),
        ];
        $limit = isset($_GET['limit']) ? max(1, min((int)$_GET['limit'], 500)) : 50;
        $items = fetch_oillogs($pdo, $filters, $limit);
        $totalLiters = 0.0;
        foreach ($items as $row) {
            $totalLiters += (float)($row['Fuel_Amount_Liters'] ?? 0);
        }
        respond_json([
            'items' => $items,
            'summary' => [
                'count' => count($items),
                'total_liters' => round($totalLiters, 2),
            ],
        ]);
    } catch (Throwable $e) {
        respond_json(['error' => $e->getMessage()], 500);
    }
}

function handle_oillog_post(): void
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

    $photoError = null;
    $photoUploads = gather_oillog_photo_uploads('attachments', $photoError);
    if ($photoError !== null) {
        respond_json(['error' => $photoError], 422);
        return;
    }
    if (count($photoUploads) === 0) {
        respond_json(['error' => 'กรุณาแนปรูปภาพประกอบอย่างน้อย 1 รูป'], 422);
        return;
    }

    $documentDate = normalize_datetime($payload['documentDate'] ?? date('Y-m-d H:i:s'));
    $workOrder = normalize_string($payload['workOrder'] ?? null, 100);
    $projectName = normalize_string($payload['projectName'] ?? null, 255);
    $locationName = normalize_string($payload['locationName'] ?? null, 255);
    $requesterName = normalize_string($payload['requesterName'] ?? null, 120);
    $supervisorName = normalize_string($payload['supervisorName'] ?? null, 120);
    $machineCode = normalize_string($payload['machineCode'] ?? null, 50);
    $machineName = normalize_string($payload['machineName'] ?? null, 120);
    $machineDescription = normalize_string($payload['machineDescription'] ?? null, 255);
    $operationDetails = normalize_text($payload['operationDetails'] ?? null, 2000);
    $fuelType = $payload['fuelType'] ?? '';
    $customFuel = normalize_string($payload['customFuelType'] ?? null, 50);
    $fuelAmount = normalize_decimal($payload['fuelAmountLiters'] ?? null);
    $fuelTicket = normalize_string($payload['fuelTicketNo'] ?? null, 80);
    $tankBefore = normalize_decimal($payload['tankBeforeLiters'] ?? null);
    $tankAfter = normalize_decimal($payload['tankAfterLiters'] ?? null);
    $meterStart = normalize_decimal($payload['meterHourStart'] ?? null);
    $meterEnd = normalize_decimal($payload['meterHourEnd'] ?? null);
    $kmStart = normalize_decimal($payload['odometerStart'] ?? null);
    $kmEnd = normalize_decimal($payload['odometerEnd'] ?? null);
    $workMeterStart = normalize_decimal($payload['workMeterStart'] ?? null);
    $workMeterEnd = normalize_decimal($payload['workMeterEnd'] ?? null);
    $workMeterTotal = normalize_decimal($payload['workMeterTotal'] ?? null);
    $timeMorningStart = normalize_time($payload['timeMorningStart'] ?? null);
    $timeMorningEnd = normalize_time($payload['timeMorningEnd'] ?? null);
    $timeMorningTotal = normalize_decimal($payload['timeMorningTotal'] ?? null);
    $timeAfternoonStart = normalize_time($payload['timeAfternoonStart'] ?? null);
    $timeAfternoonEnd = normalize_time($payload['timeAfternoonEnd'] ?? null);
    $timeAfternoonTotal = normalize_decimal($payload['timeAfternoonTotal'] ?? null);
    $timeOtStart = normalize_time($payload['timeOtStart'] ?? null);
    $timeOtEnd = normalize_time($payload['timeOtEnd'] ?? null);
    $timeOtTotal = normalize_decimal($payload['timeOtTotal'] ?? null);
    $fuelTime = normalize_time($payload['fuelTime'] ?? null);
    $operatorAccountId = isset($payload['operatorAccountId']) ? (int)$payload['operatorAccountId'] : null;
    if ($operatorAccountId !== null && $operatorAccountId <= 0) {
        $operatorAccountId = null;
    }
    $operatorName = normalize_string($payload['operatorName'] ?? null, 120);
    $assistantName = normalize_string($payload['assistantName'] ?? null, 120);
    $recorderName = normalize_string($payload['recorderName'] ?? null, 120);
    $notes = normalize_text($payload['notes'] ?? null, 2000);
    $checklistOtherNote = normalize_text($payload['checklistOtherNote'] ?? null, 500);
    $documentNo = normalize_string($payload['documentNo'] ?? null, 50);
    $checklistJson = null;
    $fuelDetailsJson = null;
    if (isset($payload['fuelDetails']) && is_array($payload['fuelDetails'])) {
        $cleanFuelDetails = [];
        foreach ($payload['fuelDetails'] as $detail) {
            if (!is_array($detail)) {
                continue;
            }
            $liters = normalize_decimal($detail['liters'] ?? null);
            if ($liters === null || $liters <= 0) {
                continue;
            }
            $cleanFuelDetails[] = [
                'id' => normalize_string($detail['id'] ?? null, 60),
                'label' => normalize_string($detail['label'] ?? null, 120),
                'code' => normalize_string($detail['code'] ?? null, 80),
                'liters' => $liters,
            ];
        }
        if (!empty($cleanFuelDetails)) {
            $fuelDetailsJson = json_encode($cleanFuelDetails, JSON_UNESCAPED_UNICODE);
        }
    }

    $allowedFuelTypes = ['ดีเซล B7', 'ดีเซล B10', 'ดีเซล B20', 'แก๊สโซฮอล์ 91', 'แก๊สโซฮอล์ 95', 'น้ำมันเครื่อง', 'น้ำมันไฮดรอลิค', 'อื่นๆ'];
    $fuelType = normalize_string($fuelType, 50) ?? '';
    if ($fuelType === 'อื่นๆ') {
        if ($customFuel !== null) {
            $fuelType = $customFuel;
        } else {
            respond_json(['error' => 'กรุณาระบุชนิดน้ำมัน (อื่นๆ)'], 422);
            return;
        }
    } elseif ($fuelType !== '' && !in_array($fuelType, $allowedFuelTypes, true)) {
        respond_json(['error' => 'ชนิดน้ำมันไม่ถูกต้อง'], 422);
        return;
    }

    if ($documentDate === null) {
        respond_json(['error' => 'กรุณาระบุวันที่'], 422);
        return;
    }
    if ($fuelType === '') {
        respond_json(['error' => 'กรุณาเลือกประเภทน้ำมัน'], 422);
        return;
    }
    if ($fuelAmount === null || $fuelAmount <= 0) {
        respond_json(['error' => 'ปริมาณน้ำมันต้องมากกว่า 0'], 422);
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
        $sessionOperatorName = resolve_session_display_name($user);
        if ($sessionOperatorName !== null) {
            $operatorName = $sessionOperatorName;
        }
        if ($operatorName === null || $operatorName === '') {
            respond_json(['error' => 'ไม่สามารถระบุชื่อพนักงานขับได้'], 422);
            return;
        }
    } else {
        $requiresOperatorLookup = true;
        if ($operatorAccountId === null || $operatorAccountId <= 0) {
            respond_json(['error' => 'กรุณาเลือกพนักงานขับรถ'], 422);
            return;
        }
    }

    if ($workMeterTotal === null && $workMeterStart !== null && $workMeterEnd !== null) {
        $workMeterTotal = round($workMeterEnd - $workMeterStart, 2);
    }
    $autoMorningTotal = diff_time_hours($timeMorningStart, $timeMorningEnd);
    if ($timeMorningTotal === null && $autoMorningTotal !== null) {
        $timeMorningTotal = $autoMorningTotal;
    }
    $autoAfternoonTotal = diff_time_hours($timeAfternoonStart, $timeAfternoonEnd);
    if ($timeAfternoonTotal === null && $autoAfternoonTotal !== null) {
        $timeAfternoonTotal = $autoAfternoonTotal;
    }
    $autoOtTotal = diff_time_hours($timeOtStart, $timeOtEnd);
    if ($timeOtTotal === null && $autoOtTotal !== null) {
        $timeOtTotal = $autoOtTotal;
    }

    if (isset($payload['checklist']) && is_array($payload['checklist'])) {
        $cleanChecklist = [];
        foreach ($payload['checklist'] as $key => $value) {
            $safeKey = preg_replace('/[^A-Za-z0-9_\-]/', '', (string)$key);
            if ($safeKey === '') {
                continue;
            }
            if ($safeKey === OIL_CHECKLIST_OTHER_ID) {
                $status = ($value === 'เลือก') ? 'เลือก' : '';
            } else {
                $status = ($value === 'ผิดปกติ') ? 'ผิดปกติ' : (($value === 'ปกติ') ? 'ปกติ' : '');
            }
            if ($status !== '') {
                $cleanChecklist[$safeKey] = $status;
            }
        }
        if (
            $checklistOtherNote !== null
            && isset($cleanChecklist[OIL_CHECKLIST_OTHER_ID])
            && $cleanChecklist[OIL_CHECKLIST_OTHER_ID] === 'เลือก'
        ) {
            $cleanChecklist[CHECKLIST_OTHER_NOTE_KEY] = $checklistOtherNote;
        }
        if (!empty($cleanChecklist)) {
            $checklistJson = json_encode($cleanChecklist, JSON_UNESCAPED_UNICODE);
        }
    }

    try {
        $pdo = db_connection();
        if ($requiresOperatorLookup) {
            $driverRow = fetch_center_user_by_id($pdo, (int)$operatorAccountId);
            if (!$driverRow) {
                respond_json(['error' => 'ไม่พบข้อมูลพนักงานขับรถ'], 422);
                return;
            }
            $driverRoles = resolve_user_roles($driverRow['Role'] ?? null);
            $driverRoleAllowed = false;
            foreach (['operator', 'driver'] as $allowedRole) {
                if (in_array($allowedRole, $driverRoles, true)) {
                    $driverRoleAllowed = true;
                    break;
                }
            }
            if (!$driverRoleAllowed) {
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
        if ($operatorName === null || $operatorName === '') {
            respond_json(['error' => 'ไม่สามารถระบุชื่อพนักงานขับได้'], 422);
            return;
        }
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('INSERT INTO OilLog (Center_Id, Document_No, Document_Date, Work_Order, Project_Name, Location_Name, Requester_Name, Supervisor_Name, Machine_Code, Machine_Name, Machine_Description, Operation_Details, Fuel_Type, Fuel_Amount_Liters, Fuel_Details_JSON, Fuel_Ticket_No, Tank_Before_Liters, Tank_After_Liters, Meter_Hour_Start, Meter_Hour_End, Odometer_Start, Odometer_End, Work_Meter_Start, Work_Meter_End, Work_Meter_Total, Time_Morning_Start, Time_Morning_End, Time_Morning_Total, Time_Afternoon_Start, Time_Afternoon_End, Time_Afternoon_Total, Time_Ot_Start, Time_Ot_End, Time_Ot_Total, Fuel_Time, Operator_Name, Assistant_Name, Recorder_Name, Notes, Checklist_JSON, Created_By) VALUES (:center_id, :document_no, :document_date, :work_order, :project_name, :location_name, :requester_name, :supervisor_name, :machine_code, :machine_name, :machine_description, :operation_details, :fuel_type, :fuel_amount, :fuel_details, :fuel_ticket, :tank_before, :tank_after, :meter_start, :meter_end, :km_start, :km_end, :work_meter_start, :work_meter_end, :work_meter_total, :time_morning_start, :time_morning_end, :time_morning_total, :time_afternoon_start, :time_afternoon_end, :time_afternoon_total, :time_ot_start, :time_ot_end, :time_ot_total, :fuel_time, :operator_name, :assistant_name, :recorder_name, :notes, :checklist_json, :created_by)');
        $stmt->execute([
            ':center_id' => $user['Center_Id'] ?? null,
            ':document_no' => $documentNo,
            ':document_date' => $documentDate,
            ':work_order' => $workOrder,
            ':project_name' => $projectName,
            ':location_name' => $locationName,
            ':requester_name' => $requesterName,
            ':supervisor_name' => $supervisorName,
            ':machine_code' => $machineCode,
            ':machine_name' => $machineName,
            ':machine_description' => $machineDescription,
            ':operation_details' => $operationDetails,
            ':fuel_type' => $fuelType,
            ':fuel_amount' => $fuelAmount,
            ':fuel_details' => $fuelDetailsJson,
            ':fuel_ticket' => $fuelTicket,
            ':tank_before' => $tankBefore,
            ':tank_after' => $tankAfter,
            ':meter_start' => $meterStart,
            ':meter_end' => $meterEnd,
            ':km_start' => $kmStart,
            ':km_end' => $kmEnd,
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
            ':fuel_time' => $fuelTime,
            ':operator_name' => $operatorName,
            ':assistant_name' => $assistantName,
            ':recorder_name' => $recorderName,
            ':notes' => $notes,
            ':checklist_json' => $checklistJson,
            ':created_by' => $user['displayName'] ?? ($user['Username'] ?? null),
        ]);

        $id = (int)$pdo->lastInsertId();
        if ($documentNo === null || $documentNo === '') {
            $autoDoc = sprintf('OIL-%s-%05d', date('Ymd', strtotime($documentDate)), $id);
            $upd = $pdo->prepare('UPDATE OilLog SET Document_No = :doc WHERE OilLog_Id = :id');
            $upd->execute([':doc' => $autoDoc, ':id' => $id]);
        }

        $photoMetadata = persist_oillog_photos($photoUploads, $id);
        if (count($photoMetadata) === 0) {
            $pdo->rollBack();
            respond_json(['error' => 'ไม่สามารถบันทึกรูปภาพได้ กรุณาลองใหม่'], 422);
            return;
        }
        $photoJson = json_encode($photoMetadata, JSON_UNESCAPED_UNICODE);
        $updPhotos = $pdo->prepare('UPDATE OilLog SET Photo_Attachments_JSON = :photos WHERE OilLog_Id = :id');
        $updPhotos->execute([
            ':photos' => $photoJson,
            ':id' => $id,
        ]);

        $machineWorkLogId = resolve_machine_work_log_id_for_oillog($pdo, $id);
        $approvalSeed = ensure_oillog_approval_record($pdo, $id, $machineWorkLogId);

        $pdo->commit();
        $item = fetch_oillog($pdo, $id);
        $approvalPayload = [
            'token' => $approvalSeed['token'],
            'expires_at' => $approvalSeed['expires_at'],
            'path' => sprintf('#/oil-approval?oilLogId=%d&token=%s', $id, $approvalSeed['token']),
        ];
        $response = [
            'item' => $item,
            'approval' => $approvalPayload,
        ];
        respond_json($response, 201);
    } catch (Throwable $e) {
        if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
            $pdo->rollBack();
        }
        respond_json(['error' => $e->getMessage()], 500);
    }
}

function handle_oillog_request(): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'GET') {
        handle_oillog_get();
        return;
    }
    if ($method === 'POST') {
        handle_oillog_post();
        return;
    }
    respond_json(['error' => 'Method not allowed'], 405);
}

if (php_sapi_name() !== 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    handle_oillog_request();
}
