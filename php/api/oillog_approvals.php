<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/auth.php';

const OILER_APPROVER_ROLES = ['oiler', 'oil', 'fuel', 'fueler', 'pump', 'recorder'];
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

function fetch_approval_context(PDO $pdo, int $oilLogId, string $token): ?array
{
    $stmt = $pdo->prepare(
        'SELECT
            log.OilLog_Id,
            log.Document_No,
            log.Document_Date,
            log.Project_Name,
            log.Location_Name,
            log.Machine_Code,
            log.Machine_Name,
            log.Fuel_Type,
            log.Fuel_Amount_Liters,
            log.Tank_Before_Liters,
            log.Tank_After_Liters,
            log.Operator_Name,
            log.Assistant_Name,
            log.Recorder_Name,
            log.Work_Order,
            log.Supervisor_Name,
            log.Notes,
            mwl.MachineWorkLog_Id,
            apr.Approval_Token,
            apr.Token_Expires_At,
            apr.Oiler_User_Id,
            apr.Oiler_Approved_At,
            apr.Oiler_Remark,
            mwlapr.Inspector_User_Id,
            mwlapr.Inspector_Approved_At,
            mwlapr.Inspector_Remark,
            oiler.Username AS Oiler_Username,
            oiler.Name AS Oiler_Name,
            oiler.Lastname AS Oiler_Lastname,
            inspector.Username AS Inspector_Username,
            inspector.Name AS Inspector_Name,
            inspector.Lastname AS Inspector_Lastname
        FROM OilLog log
        LEFT JOIN MachineWorkLog mwl ON mwl.MachineWorkLog_Id = (
            SELECT mwl2.MachineWorkLog_Id FROM MachineWorkLog mwl2
            WHERE mwl2.Machine_Code = log.Machine_Code
                AND mwl2.Document_Date <= log.Document_Date
            ORDER BY mwl2.Document_Date DESC, mwl2.MachineWorkLog_Id DESC
            LIMIT 1
        )
        LEFT JOIN OilLogApproval apr ON apr.MachineWorkLog_Id = mwl.MachineWorkLog_Id
        LEFT JOIN MachineWorkLogApproval mwlapr ON mwlapr.MachineWorkLog_Id = mwl.MachineWorkLog_Id
        LEFT JOIN Center oiler ON oiler.Center_Id = apr.Oiler_User_Id
        LEFT JOIN Center inspector ON inspector.Center_Id = mwlapr.Inspector_User_Id
        WHERE log.OilLog_Id = :id AND apr.Approval_Token = :token
        LIMIT 1'
    );
    $stmt->execute([
        ':id' => $oilLogId,
        ':token' => $token,
    ]);
    $row = $stmt->fetch();
    if (!$row) {
        return null;
    }
    $oilerName = trim(sprintf('%s %s', (string)($row['Oiler_Name'] ?? ''), (string)($row['Oiler_Lastname'] ?? '')));
    if ($oilerName === '') {
        $oilerName = $row['Oiler_Username'] ?? null;
    }
    $inspectorName = trim(sprintf('%s %s', (string)($row['Inspector_Name'] ?? ''), (string)($row['Inspector_Lastname'] ?? '')));
    if ($inspectorName === '') {
        $inspectorName = $row['Inspector_Username'] ?? null;
    }
    $machineWorkLogId = $row['MachineWorkLog_Id'] !== null ? (int)$row['MachineWorkLog_Id'] : null;
    return [
        'oilLog' => [
            'id' => (int)$row['OilLog_Id'],
            'document_no' => $row['Document_No'],
            'document_date' => $row['Document_Date'],
            'project_name' => $row['Project_Name'],
            'location_name' => $row['Location_Name'],
            'machine_code' => $row['Machine_Code'],
            'machine_name' => $row['Machine_Name'],
            'fuel_type' => $row['Fuel_Type'],
            'fuel_amount_liters' => $row['Fuel_Amount_Liters'],
            'tank_before_liters' => $row['Tank_Before_Liters'],
            'tank_after_liters' => $row['Tank_After_Liters'],
            'fuel_before_liters' => $row['Tank_Before_Liters'],
            'fuel_after_liters' => $row['Tank_After_Liters'],
            'operator_name' => $row['Operator_Name'],
            'assistant_name' => $row['Assistant_Name'],
            'recorder_name' => $row['Recorder_Name'],
            'work_order' => $row['Work_Order'],
            'supervisor_name' => $row['Supervisor_Name'],
            'notes' => $row['Notes'],
        ],
        'machineWorkLog' => [
            'id' => $machineWorkLogId,
        ],
        'approval' => [
            'token' => $row['Approval_Token'],
            'expires_at' => $row['Token_Expires_At'],
            'oiler' => [
                'user_id' => $row['Oiler_User_Id'] ? (int)$row['Oiler_User_Id'] : null,
                'approved_at' => $row['Oiler_Approved_At'],
                'remark' => $row['Oiler_Remark'],
                'full_name' => $oilerName,
            ],
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

function handle_get_request(): void
{
    require_auth();
    $oilLogId = isset($_GET['oilLogId']) ? (int)$_GET['oilLogId'] : 0;
    $token = trim((string)($_GET['token'] ?? ''));
    if ($oilLogId <= 0 || $token === '') {
        respond_json(['error' => 'ต้องระบุ oilLogId และ token'], 422);
        return;
    }
    $pdo = db_connection();
    $context = fetch_approval_context($pdo, $oilLogId, $token);
    if (!$context) {
        respond_json(['error' => 'ไม่พบใบงานหรือโทเคนไม่ถูกต้อง'], 404);
        return;
    }
    respond_json($context);
}

function handle_post_request(): void
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
    $oilLogId = isset($payload['oilLogId']) ? (int)$payload['oilLogId'] : 0;
    $token = trim((string)($payload['token'] ?? ''));
    $approvalType = strtolower(trim((string)($payload['approvalType'] ?? '')));
    if ($oilLogId <= 0 || $token === '' || !in_array($approvalType, ['oiler', 'inspector'], true)) {
        respond_json(['error' => 'ข้อมูลไม่ครบถ้วน'], 422);
        return;
    }
    $remark = normalize_remark($payload['remark'] ?? null);
    $requiredRoles = $approvalType === 'oiler' ? OILER_APPROVER_ROLES : INSPECTOR_APPROVER_ROLES;
    if (!user_has_any_role($user, $requiredRoles)) {
        respond_json(['error' => 'บัญชีนี้ไม่ได้รับสิทธิ์ยืนยัน'], 403);
        return;
    }
    $pdo = db_connection();
    $context = fetch_approval_context($pdo, $oilLogId, $token);
    if (!$context) {
        respond_json(['error' => 'ไม่พบใบงานหรือโทเคนหมดอายุ'], 404);
        return;
    }
    $machineWorkLogId = $context['machineWorkLog']['id'] ?? null;
    if (!$machineWorkLogId) {
        respond_json(['error' => 'ยังไม่มี Machine Work Log ที่สอดคล้องกับใบงานนี้'], 409);
        return;
    }
    $now = date('Y-m-d H:i:s');
    if ($approvalType === 'oiler') {
        if (!empty($context['approval']['oiler']['approved_at'])) {
            respond_json(['error' => 'พนักงานออยเลอร์ยืนยันแล้ว'], 409);
            return;
        }
        $stmt = $pdo->prepare('UPDATE OilLogApproval SET Oiler_User_Id = :userId, Oiler_Approved_At = :ts, Oiler_Remark = :remark, Updated_At = CURRENT_TIMESTAMP WHERE MachineWorkLog_Id = :machineWorkLogId AND Approval_Token = :token');
        $stmt->execute([
            ':userId' => $user['Center_Id'] ?? null,
            ':ts' => $now,
            ':remark' => $remark,
            ':machineWorkLogId' => $machineWorkLogId,
            ':token' => $token,
        ]);
    } else {
        respond_json(['error' => 'กรุณายืนยันบทบาทผู้ตรวจผ่านระบบ Machine Work Log'], 400);
        return;
    }
    $refreshed = fetch_approval_context($pdo, $oilLogId, $token);
    respond_json($refreshed ?? ['error' => 'ไม่สามารถโหลดข้อมูลหลังบันทึกได้'], $refreshed ? 200 : 500);
}

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method === 'OPTIONS') {
        respond_json(['ok' => true]);
        return;
    }
    if ($method === 'GET') {
        handle_get_request();
        return;
    }
    if ($method === 'POST') {
        handle_post_request();
        return;
    }
    respond_json(['error' => 'Method Not Allowed'], 405);
} catch (Throwable $e) {
    respond_json(['error' => $e->getMessage()], 500);
}
