<?php

declare(strict_types=1);

require_once __DIR__ . '/../auth.php';

function normalize_param(?string $value, int $maxLen = 100): ?string
{
    if ($value === null) {
        return null;
    }
    $trimmed = trim($value);
    if ($trimmed === '') {
        return null;
    }
    if (function_exists('mb_strlen') && mb_strlen($trimmed) > $maxLen) {
        $trimmed = mb_substr($trimmed, 0, $maxLen);
    } elseif (strlen($trimmed) > $maxLen) {
        $trimmed = substr($trimmed, 0, $maxLen);
    }
    return $trimmed;
}

function admin_reports_base_select(): string
{
    return 'SELECT r.Report_Id, r.Center_Id, r.Machine_Id, r.Details, r.Admin_Remark, r.Status, r.RPCreated_at, r.Updated_at,
                    c.CenterName,
                    c.Name,
                    c.Name AS Reporter_FirstName,
                    c.LastName,
                    c.LastName AS Reporter_LastName,
                    m.Equipment AS Machine_Code,
                    m.Description AS Machine_Description,
                    m.Machine_Type AS Machine_Type,
                    m.Class AS Machine_Class
                    FROM Report r
                    LEFT JOIN Center c ON c.Center_Id = r.Center_Id
                    LEFT JOIN Machines m ON m.Machine_Id = r.Machine_Id';
}

function normalize_status_value($value): ?string
{
    if ($value === null) {
        return null;
    }
    $clean = strtolower(trim((string)$value));
    if ($clean === 'in-progress') {
        $clean = 'in_progress';
    }
    if (in_array($clean, ['done', 'complete', 'closed'], true)) {
        $clean = 'resolved';
    }
    $allowed = ['new', 'in_progress', 'resolved'];
    return in_array($clean, $allowed, true) ? $clean : null;
}

function can_progress_status(?string $current, string $next): bool
{
    static $order = ['new' => 0, 'in_progress' => 1, 'resolved' => 2];
    $nextIndex = $order[$next] ?? -1;
    if ($nextIndex === -1) {
        return false;
    }
    if ($current === null) {
        return true;
    }
    $currentIndex = $order[$current] ?? -1;
    if ($currentIndex === -1) {
        return true;
    }
    return $nextIndex > $currentIndex;
}

function sanitize_admin_note($value, int $maxLen = 2000): ?string
{
    if ($value === null) {
        return null;
    }
    $note = trim((string)$value);
    if ($note === '') {
        return null;
    }
    if (function_exists('mb_strlen')) {
        if (mb_strlen($note) > $maxLen) {
            $note = mb_substr($note, 0, $maxLen);
        }
    } elseif (strlen($note) > $maxLen) {
        $note = substr($note, 0, $maxLen);
    }
    return $note;
}

function read_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        json_response(['error' => 'invalid JSON payload'], 400);
        exit;
    }
    return $decoded;
}

function gather_report_photos_admin(int $reportId): array
{
    if ($reportId <= 0) {
        return [];
    }
    static $reportsRoot = null;
    if ($reportsRoot === null) {
        $uploadsRoot = realpath(__DIR__ . '/../../uploads');
        if ($uploadsRoot === false) {
            $uploadsRoot = __DIR__ . '/../../uploads';
        }
        $reportsRoot = rtrim($uploadsRoot, DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR . 'reports';
    }
    $dir = $reportsRoot . DIRECTORY_SEPARATOR . 'report' . $reportId;
    if (!is_dir($dir)) {
        return [];
    }
    $files = @scandir($dir);
    if ($files === false) {
        return [];
    }
    $photos = [];
    foreach ($files as $file) {
        if ($file === '.' || $file === '..') {
            continue;
        }
        $full = $dir . DIRECTORY_SEPARATOR . $file;
        if (!is_file($full)) {
            continue;
        }
        $stat = @stat($full);
        $photos[] = [
            'name' => $file,
            'url' => str_replace('\\', '/', '/uploads/reports/report' . $reportId . '/' . $file),
            'size' => $stat ? (int)$stat['size'] : null,
            'modified_at' => ($stat && isset($stat['mtime'])) ? date('c', (int)$stat['mtime']) : null,
        ];
    }
    usort($photos, static function (array $a, array $b): int {
        $aTime = isset($a['modified_at']) ? strtotime((string)$a['modified_at']) : 0;
        $bTime = isset($b['modified_at']) ? strtotime((string)$b['modified_at']) : 0;
        return $bTime <=> $aTime;
    });
    return $photos;
}

function transform_report_row(array $row): array
{
    $row['photos'] = gather_report_photos_admin((int)$row['Report_Id']);
    return $row;
}

function handle_report_patch(PDO $pdo): void
{
    $payload = read_json_body();
    $reportId = isset($payload['id']) ? (int)$payload['id'] : 0;
    if ($reportId <= 0) {
        json_response(['error' => 'รหัสรายการไม่ถูกต้อง'], 400);
        return;
    }

    $status = normalize_status_value($payload['status'] ?? null);
    if ($status === null) {
        json_response(['error' => 'สถานะไม่ถูกต้อง'], 422);
        return;
    }

    $currentStmt = $pdo->prepare('SELECT Status FROM Report WHERE Report_Id = :id LIMIT 1');
    $currentStmt->execute([':id' => $reportId]);
    $currentRow = $currentStmt->fetch();
    if (!$currentRow) {
        json_response(['error' => 'ไม่พบรายการ'], 404);
        return;
    }

    $currentStatus = normalize_status_value($currentRow['Status'] ?? null);
    if (!can_progress_status($currentStatus, $status)) {
        json_response(['error' => 'ไม่สามารถย้อนหรือเลือกสถานะเดิมได้'], 422);
        return;
    }

    $remarkProvided = array_key_exists('admin_note', $payload);
    $adminNote = $remarkProvided ? sanitize_admin_note($payload['admin_note']) : null;

    if ($remarkProvided) {
        $stmt = $pdo->prepare('UPDATE Report SET Status = :status, Admin_Remark = :remark WHERE Report_Id = :id');
        $stmt->execute([
            ':status' => $status,
            ':remark' => $adminNote,
            ':id' => $reportId,
        ]);
    } else {
        $stmt = $pdo->prepare('UPDATE Report SET Status = :status WHERE Report_Id = :id');
        $stmt->execute([
            ':status' => $status,
            ':id' => $reportId,
        ]);
    }

    if ($stmt->rowCount() === 0) {
        json_response(['error' => 'ไม่พบรายการ'], 404);
        return;
    }

    $select = admin_reports_base_select() . ' WHERE r.Report_Id = :id LIMIT 1';
    $fetch = $pdo->prepare($select);
    $fetch->execute([':id' => $reportId]);
    $row = $fetch->fetch();
    if (!$row) {
        json_response(['error' => 'ไม่พบรายการ'], 404);
        return;
    }

    json_response(['item' => transform_report_row($row)]);
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    if ($method === 'PATCH') {
        require_role(['admin']);
        $pdo = db_connection();
        handle_report_patch($pdo);
        exit;
    }

    if ($method !== 'GET') {
        json_response(['error' => 'Method Not Allowed'], 405);
        exit;
    }

    require_role(['admin']);
    $pdo = db_connection();

    $baseSelect = admin_reports_base_select();

    if (isset($_GET['id'])) {
        $id = (int)$_GET['id'];
        if ($id <= 0) {
            json_response(['error' => 'Invalid id'], 400);
            exit;
        }
        $stmt = $pdo->prepare($baseSelect . ' WHERE r.Report_Id = :id LIMIT 1');
        $stmt->execute([':id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            json_response(['error' => 'Not found'], 404);
            exit;
        }
        json_response(['item' => transform_report_row($row)]);
        exit;
    }

    $statusFilter = normalize_param(isset($_GET['status']) ? (string)$_GET['status'] : null, 20);
    $centerFilter = isset($_GET['centerId']) ? (int)$_GET['centerId'] : null;
    $machineFilter = normalize_param(isset($_GET['machine']) ? (string)$_GET['machine'] : null, 50);
    $searchFilter = normalize_param(isset($_GET['q']) ? (string)$_GET['q'] : null, 100);
    $limit = isset($_GET['limit']) ? max(1, min((int)$_GET['limit'], 500)) : 100;

    $conditions = [];
    $params = [];
    if ($statusFilter !== null && strtolower($statusFilter) !== 'all') {
        $conditions[] = 'r.Status = :status';
        $params[':status'] = $statusFilter;
    }
    if ($centerFilter !== null && $centerFilter > 0) {
        $conditions[] = 'r.Center_Id = :centerId';
        $params[':centerId'] = $centerFilter;
    }
    if ($machineFilter !== null) {
        if (is_numeric($machineFilter)) {
            $conditions[] = '(r.Machine_Id = :machineId OR m.Equipment LIKE :machineLike)';
            $params[':machineId'] = (int)$machineFilter;
            $params[':machineLike'] = '%' . $machineFilter . '%';
        } else {
            $conditions[] = 'm.Equipment LIKE :machineLike';
            $params[':machineLike'] = '%' . $machineFilter . '%';
        }
    }
    if ($searchFilter !== null) {
        $conditions[] = '(r.Details LIKE :search OR m.Description LIKE :search OR m.Equipment LIKE :search)';
        $params[':search'] = '%' . $searchFilter . '%';
    }

    $sql = $baseSelect;
    if (!empty($conditions)) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }
    $sql .= ' ORDER BY r.RPCreated_at DESC, r.Report_Id DESC LIMIT ' . $limit;

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $items = array_map('transform_report_row', $rows ?: []);

    json_response([
        'items' => $items,
        'meta' => [
            'count' => count($items),
            'limit' => $limit,
        ],
    ]);
} catch (Throwable $e) {
    error_log('[admin/reports] ' . $e->getMessage());
    json_response(['error' => 'Internal error'], 500);
}
