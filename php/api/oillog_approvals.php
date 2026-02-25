<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/auth.php';

const OILER_APPROVER_ROLES = ['oiler', 'oil', 'fuel', 'fueler', 'pump', 'recorder'];
const INSPECTOR_APPROVER_ROLES = ['inspector', 'assistant'];

function normalize_token_input(string $token): string
{
    return trim($token);
}

function is_oillog_token_expired(?string $expiresAt): bool
{
    if ($expiresAt === null || $expiresAt === '') {
        return false;
    }
    $ts = strtotime($expiresAt);
    if ($ts === false) {
        return false;
    }
    return $ts < time();
}

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
            log.Supervisor_Name,
            log.Notes,
            COALESCE(apr.MachineWorkLog_Id, fallback_mwl.MachineWorkLog_Id) AS Resolved_MachineWorkLog_Id,
            apr.MachineWorkLog_Id AS Apr_MachineWorkLog_Id,
            fallback_mwl.MachineWorkLog_Id AS Fallback_MachineWorkLog_Id,
            apr.Approval_Token,
            apr.Token_Expires_At,
            apr.Oiler_User_Id,
            apr.Oiler_Approved_At,
            apr.Oiler_Remark,
            mwl.Work_Order AS MWL_Work_Order,
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
        LEFT JOIN OilLogApproval apr ON apr.OilLog_Id = log.OilLog_Id AND apr.Approval_Token IS NOT NULL AND LOWER(apr.Approval_Token) = LOWER(:token)
        LEFT JOIN MachineWorkLog fallback_mwl ON fallback_mwl.MachineWorkLog_Id = (
            SELECT mwl2.MachineWorkLog_Id FROM MachineWorkLog mwl2
            WHERE mwl2.Machine_Code = log.Machine_Code
                AND DATE(mwl2.Document_Date) = DATE(log.Document_Date)
            ORDER BY mwl2.MachineWorkLog_Id DESC
            LIMIT 1
        )
        LEFT JOIN MachineWorkLog mwl ON mwl.MachineWorkLog_Id = COALESCE(apr.MachineWorkLog_Id, fallback_mwl.MachineWorkLog_Id)
        LEFT JOIN MachineWorkLogApproval mwlapr ON mwlapr.MachineWorkLog_Id = mwl.MachineWorkLog_Id
        LEFT JOIN Center oiler ON oiler.Center_Id = apr.Oiler_User_Id
        LEFT JOIN Center inspector ON inspector.Center_Id = mwlapr.Inspector_User_Id
        WHERE log.OilLog_Id = :id AND apr.Approval_Token IS NOT NULL
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
    $resolvedMachineWorkLogId = isset($row['Resolved_MachineWorkLog_Id']) && $row['Resolved_MachineWorkLog_Id'] !== null
        ? (int)$row['Resolved_MachineWorkLog_Id']
        : null;
    $storedMachineWorkLogId = isset($row['Apr_MachineWorkLog_Id']) && $row['Apr_MachineWorkLog_Id'] !== null
        ? (int)$row['Apr_MachineWorkLog_Id']
        : null;
    $fallbackMachineWorkLogId = isset($row['Fallback_MachineWorkLog_Id']) && $row['Fallback_MachineWorkLog_Id'] !== null
        ? (int)$row['Fallback_MachineWorkLog_Id']
        : null;
    if ($storedMachineWorkLogId === null && $fallbackMachineWorkLogId !== null) {
        backfill_oillogapproval_machine_work_log($pdo, (int)$row['OilLog_Id'], $fallbackMachineWorkLogId);
        $storedMachineWorkLogId = $fallbackMachineWorkLogId;
    }
    $machineWorkLogId = $storedMachineWorkLogId ?? $resolvedMachineWorkLogId;
    $oilerName = trim(sprintf('%s %s', (string)($row['Oiler_Name'] ?? ''), (string)($row['Oiler_Lastname'] ?? '')));
    if ($oilerName === '') {
        $oilerName = $row['Oiler_Username'] ?? null;
    }
    $inspectorName = trim(sprintf('%s %s', (string)($row['Inspector_Name'] ?? ''), (string)($row['Inspector_Lastname'] ?? '')));
    if ($inspectorName === '') {
        $inspectorName = $row['Inspector_Username'] ?? null;
    }
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
            'assistant_name' => null,
            'recorder_name' => null,
            'work_order' => $row['MWL_Work_Order'] ?? null,
            'supervisor_name' => $row['Supervisor_Name'],
            'notes' => $row['Notes'],
        ],
        'machineWorkLog' => [
            'id' => $machineWorkLogId,
        ],
        'approval' => [
            'token' => $row['Approval_Token'],
            'expires_at' => $row['Token_Expires_At'],
            'token_expired' => is_oillog_token_expired($row['Token_Expires_At'] ?? null),
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

function find_existing_token_owner(PDO $pdo, string $token): ?int
{
    $stmt = $pdo->prepare('SELECT OilLog_Id FROM OilLogApproval WHERE LOWER(Approval_Token) = LOWER(:token) LIMIT 1');
    $stmt->execute([':token' => $token]);
    $row = $stmt->fetch();
    return $row ? (int)$row['OilLog_Id'] : null;
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
    $stmt = $pdo->prepare('SELECT MachineWorkLog_Id FROM MachineWorkLog WHERE Machine_Code = :machineCode AND DATE(Document_Date) = DATE(:documentDate) ORDER BY MachineWorkLog_Id DESC LIMIT 1');
    $stmt->execute([
        ':machineCode' => $machineCode,
        ':documentDate' => $documentDate,
    ]);
    $row = $stmt->fetch();
    return $row ? (int)$row['MachineWorkLog_Id'] : null;
}

function backfill_oillogapproval_machine_work_log(PDO $pdo, int $oilLogId, int $machineWorkLogId): void
{
    if ($machineWorkLogId <= 0) {
        return;
    }
    $existingStmt = $pdo->prepare('SELECT MachineWorkLog_Id FROM OilLogApproval WHERE OilLog_Id = :oilLogId LIMIT 1');
    $existingStmt->execute([':oilLogId' => $oilLogId]);
    $existing = $existingStmt->fetch();
    if ($existing && $existing['MachineWorkLog_Id'] !== null) {
        return;
    }
    $conflictStmt = $pdo->prepare('SELECT OilLog_Id FROM OilLogApproval WHERE MachineWorkLog_Id = :machineWorkLogId LIMIT 1');
    $conflictStmt->execute([':machineWorkLogId' => $machineWorkLogId]);
    $conflict = $conflictStmt->fetch();
    if ($conflict && (int)$conflict['OilLog_Id'] !== $oilLogId) {
        return;
    }
    $update = $pdo->prepare('UPDATE OilLogApproval SET MachineWorkLog_Id = :machineWorkLogId, Updated_At = CURRENT_TIMESTAMP WHERE OilLog_Id = :oilLogId AND (MachineWorkLog_Id IS NULL OR MachineWorkLog_Id = 0)');
    $update->execute([
        ':machineWorkLogId' => $machineWorkLogId,
        ':oilLogId' => $oilLogId,
    ]);
}

function sync_missing_oillog_token(PDO $pdo, int $oilLogId, string $token): ?array
{
    $existingRowStmt = $pdo->prepare('SELECT Approval_Token FROM OilLogApproval WHERE OilLog_Id = :id LIMIT 1');
    $existingRowStmt->execute([':id' => $oilLogId]);
    $existingRow = $existingRowStmt->fetch();
    if ($existingRow) {
        $storedToken = trim((string)$existingRow['Approval_Token']);
        if ($storedToken !== '') {
            return null;
        }
    }
    $tokenOwner = find_existing_token_owner($pdo, $token);
    if ($tokenOwner !== null && $tokenOwner !== $oilLogId) {
        return null;
    }
    $logExistsStmt = $pdo->prepare('SELECT OilLog_Id FROM OilLog WHERE OilLog_Id = :id LIMIT 1');
    $logExistsStmt->execute([':id' => $oilLogId]);
    if (!$logExistsStmt->fetch()) {
        return null;
    }
    $machineWorkLogId = resolve_machine_work_log_id_for_oillog($pdo, $oilLogId);
    $expiresAt = date('Y-m-d H:i:s', strtotime('+7 days'));
    $stmt = $pdo->prepare(
        'INSERT INTO OilLogApproval (OilLog_Id, MachineWorkLog_Id, Approval_Token, Token_Expires_At)
        VALUES (:oilLogId, :machineWorkLogId, :token, :expiresAt)
        ON DUPLICATE KEY UPDATE
            Approval_Token = COALESCE(Approval_Token, VALUES(Approval_Token)),
            Token_Expires_At = VALUES(Token_Expires_At),
            MachineWorkLog_Id = COALESCE(VALUES(MachineWorkLog_Id), MachineWorkLog_Id)'
    );
    $stmt->execute([
        ':oilLogId' => $oilLogId,
        ':machineWorkLogId' => $machineWorkLogId,
        ':token' => $token,
        ':expiresAt' => $expiresAt,
    ]);
    return fetch_approval_context($pdo, $oilLogId, $token);
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
    $oilLogId = isset($_GET['oilLogId']) ? (int)$_GET['oilLogId'] : 0;
    $token = normalize_token_input((string)($_GET['token'] ?? ''));
    if ($oilLogId <= 0 || $token === '') {
        respond_json(['error' => 'ต้องระบุ oilLogId และ token'], 422);
        return;
    }
    $pdo = db_connection();
    $context = fetch_approval_context($pdo, $oilLogId, $token);
    if (!$context) {
        $tokenOwner = find_existing_token_owner($pdo, $token);
        if ($tokenOwner && $tokenOwner !== $oilLogId) {
            $context = fetch_approval_context($pdo, $tokenOwner, $token);
        } elseif (!$tokenOwner) {
            $context = sync_missing_oillog_token($pdo, $oilLogId, $token);
        }
    }
    if (!$context) {
        respond_json(['error' => 'ไม่พบใบงานหรือโทเคนไม่ถูกต้อง หรือโทเคนหมดอายุ'], 404);
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
    $token = normalize_token_input((string)($payload['token'] ?? ''));
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
        $tokenOwner = find_existing_token_owner($pdo, $token);
        if ($tokenOwner && $tokenOwner !== $oilLogId) {
            $oilLogId = $tokenOwner;
            $context = fetch_approval_context($pdo, $oilLogId, $token);
        }
        if (!$context) {
            respond_json(['error' => 'ไม่พบใบงานหรือโทเคนหมดอายุ'], 404);
            return;
        }
    }
    if (!empty($context['approval']['token_expired'])) {
        respond_json(['error' => 'โทเคนนี้หมดอายุแล้ว กรุณาขอสแกนใหม่'], 410);
        return;
    }
    $machineWorkLogId = $context['machineWorkLog']['id'] ?? null;
    $now = date('Y-m-d H:i:s');
    if ($approvalType === 'oiler') {
        if (!empty($context['approval']['oiler']['approved_at'])) {
            respond_json(['error' => 'พนักงานออยเลอร์ยืนยันแล้ว'], 409);
            return;
        }
        $stmt = $pdo->prepare('UPDATE OilLogApproval SET Oiler_User_Id = :userId, Oiler_Approved_At = :ts, Oiler_Remark = :remark, MachineWorkLog_Id = COALESCE(MachineWorkLog_Id, :machineWorkLogId), Updated_At = CURRENT_TIMESTAMP WHERE OilLog_Id = :oilLogId AND LOWER(Approval_Token) = LOWER(:token)');
        $stmt->execute([
            ':userId' => $user['Center_Id'] ?? null,
            ':ts' => $now,
            ':remark' => $remark,
            ':machineWorkLogId' => $machineWorkLogId,
            ':oilLogId' => $oilLogId,
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
