<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';

const INSPECTOR_APPROVER_ROLES = ['inspector', 'assistant'];

function normalize_remark($value): ?string
{
    if ($value === null) {
        return null;
    }
    $text = trim((string)$value);
    if ($text === '') {
        return null;
    }
    if (mb_strlen($text) > 500) {
        $text = mb_substr($text, 0, 500);
    }
    return $text;
}

function compose_center_display_name($username, $firstName, $lastName): ?string
{
    $full = trim(sprintf('%s %s', (string)$firstName, (string)$lastName));
    if ($full !== '') {
        return $full;
    }
    $username = trim((string)$username);
    return $username !== '' ? $username : null;
}

function decode_work_orders($jsonValue): array
{
    if ($jsonValue === null) {
        return [];
    }
    if (!is_string($jsonValue)) {
        return [];
    }
    $decoded = json_decode($jsonValue, true);
    if (!is_array($decoded)) {
        return [];
    }
    $orders = [];
    foreach ($decoded as $entry) {
        if (!is_string($entry)) {
            continue;
        }
        $clean = trim($entry);
        if ($clean !== '') {
            $orders[] = $clean;
        }
    }
    return $orders;
}

function fetch_machine_work_log_context(PDO $pdo, int $logId, string $token): ?array
{
    $stmt = $pdo->prepare(
        'SELECT
            log.MachineWorkLog_Id,
            log.Document_No,
            log.Document_Date,
            log.Machine_Code,
            log.Machine_Name,
            log.Machine_Description,
            log.Operation_Details,
            log.Work_Order,
            log.Work_Orders_JSON,
            log.Work_Meter_Total,
            log.Created_By,
            apr.Approval_Token,
            apr.Token_Expires_At,
            apr.Inspector_User_Id,
            apr.Inspector_Approved_At,
            apr.Inspector_Remark,
            inspector.Username AS Inspector_Username,
            inspector.Name AS Inspector_Name,
            inspector.Lastname AS Inspector_Lastname
        FROM MachineWorkLogApproval apr
        INNER JOIN MachineWorkLog log ON log.MachineWorkLog_Id = apr.MachineWorkLog_Id
        LEFT JOIN Center inspector ON inspector.Center_Id = apr.Inspector_User_Id
        WHERE apr.MachineWorkLog_Id = :id AND apr.Approval_Token = :token
        LIMIT 1'
    );
    $stmt->execute([
        ':id' => $logId,
        ':token' => $token,
    ]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }

    $inspectorName = compose_center_display_name(
        $row['Inspector_Username'] ?? null,
        $row['Inspector_Name'] ?? null,
        $row['Inspector_Lastname'] ?? null
    );

    $workOrders = decode_work_orders($row['Work_Orders_JSON'] ?? null);
    if (!$workOrders && !empty($row['Work_Order'])) {
        $single = trim((string)$row['Work_Order']);
        if ($single !== '') {
            $workOrders[] = $single;
        }
    }

    return [
        'machineWorkLog' => [
            'id' => (int)$row['MachineWorkLog_Id'],
            'document_no' => $row['Document_No'],
            'document_date' => $row['Document_Date'],
            'machine_code' => $row['Machine_Code'],
            'machine_name' => $row['Machine_Name'],
            'machine_description' => $row['Machine_Description'],
            'operation_details' => $row['Operation_Details'],
            'work_orders' => $workOrders,
            'work_meter_total' => $row['Work_Meter_Total'],
            'created_by' => $row['Created_By'],
        ],
        'approval' => [
            'token' => $row['Approval_Token'],
            'expires_at' => $row['Token_Expires_At'],
            'inspector' => [
                'user_id' => $row['Inspector_User_Id'] ? (int)$row['Inspector_User_Id'] : null,
                'approved_at' => $row['Inspector_Approved_At'],
                'remark' => $row['Inspector_Remark'],
                'full_name' => $inspectorName,
            ],
        ],
    ];
}

function user_has_any_role(array $user, array $expectedRoles): bool
{
    foreach ($expectedRoles as $role) {
        if (user_has_role($user, $role)) {
            return true;
        }
    }
    return false;
}

function handle_machine_work_log_approval_get(): void
{
    require_auth();
    $logId = isset($_GET['machineWorkLogId']) ? (int)$_GET['machineWorkLogId'] : 0;
    $token = trim((string)($_GET['token'] ?? ''));
    if ($logId <= 0 || $token === '') {
        respond_json(['error' => 'ต้องระบุ machineWorkLogId และ token'], 422);
        return;
    }
    $pdo = db_connection();
    $context = fetch_machine_work_log_context($pdo, $logId, $token);
    if (!$context) {
        respond_json(['error' => 'ไม่พบใบงานหรือโทเคนไม่ถูกต้อง'], 404);
        return;
    }
    respond_json($context);
}

function handle_machine_work_log_approval_post(): void
{
    $user = require_auth();
    $raw = file_get_contents('php://input');
    $payload = json_decode($raw ?: 'null', true);
    if (!is_array($payload) || !$payload) {
        $payload = $_POST ?? [];
        if (!is_array($payload)) {
            $payload = [];
        }
    }
    $action = strtolower(trim((string)($payload['action'] ?? '')));
    if ($action !== 'confirm') {
        respond_json(['error' => 'Action ไม่ถูกต้อง'], 400);
        return;
    }
    $logId = isset($payload['machineWorkLogId']) ? (int)$payload['machineWorkLogId'] : 0;
    $token = trim((string)($payload['token'] ?? ''));
    if ($logId <= 0 || $token === '') {
        respond_json(['error' => 'ข้อมูลไม่ครบถ้วน'], 422);
        return;
    }
    if (!user_has_any_role($user, INSPECTOR_APPROVER_ROLES)) {
        respond_json(['error' => 'บัญชีนี้ไม่ได้รับสิทธิ์ยืนยัน'], 403);
        return;
    }
    $remark = normalize_remark($payload['remark'] ?? null);

    $pdo = db_connection();
    $context = fetch_machine_work_log_context($pdo, $logId, $token);
    if (!$context) {
        respond_json(['error' => 'ไม่พบใบงานหรือโทเคนหมดอายุ'], 404);
        return;
    }
    if (!empty($context['approval']['inspector']['approved_at'])) {
        respond_json(['error' => 'ผู้ตรวจสอบยืนยันแล้ว'], 409);
        return;
    }

    $now = date('Y-m-d H:i:s');
    $stmt = $pdo->prepare(
        'UPDATE MachineWorkLogApproval
         SET Inspector_User_Id = :userId,
             Inspector_Approved_At = :ts,
             Inspector_Remark = :remark,
             Updated_At = CURRENT_TIMESTAMP
         WHERE MachineWorkLog_Id = :logId AND Approval_Token = :token'
    );
    $stmt->execute([
        ':userId' => $user['Center_Id'] ?? null,
        ':ts' => $now,
        ':remark' => $remark,
        ':logId' => $logId,
        ':token' => $token,
    ]);

    $refreshed = fetch_machine_work_log_context($pdo, $logId, $token);
    respond_json($refreshed ?? ['error' => 'ไม่สามารถโหลดข้อมูลหลังบันทึกได้'], $refreshed ? 200 : 500);
}

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method === 'OPTIONS') {
        respond_json(['ok' => true]);
        return;
    }
    if ($method === 'GET') {
        handle_machine_work_log_approval_get();
        return;
    }
    if ($method === 'POST') {
        handle_machine_work_log_approval_post();
        return;
    }
    respond_json(['error' => 'Method Not Allowed'], 405);
} catch (Throwable $e) {
    respond_json(['error' => $e->getMessage()], 500);
}
