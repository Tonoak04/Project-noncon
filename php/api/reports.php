<?php
declare(strict_types=1);

require_once __DIR__ . '/server.php';
require_once __DIR__ . '/auth.php';

ini_set('display_errors', '1');
ini_set('display_startup_errors', '1');
error_reporting(E_ALL);

const REPORT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const REPORT_MAX_FILE_SIZE_MB = 5;

$logDir = realpath(__DIR__ . '/../logs') ?: (__DIR__ . '/../logs');
if (!is_dir($logDir)) {
    @mkdir($logDir, 0755, true);
}

$errLog = $logDir . '/reports-error.log';

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Access-Control-Allow-Credentials: true');
} else {
    header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept');
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

function handle_post(): void
{
    try {
        $pdo = db_connection();
        $details = trim((string)($_POST['Details'] ?? ''));
        $machineId = isset($_POST['Machine_Id']) && $_POST['Machine_Id'] !== '' ? (int)$_POST['Machine_Id'] : null;
        $status = trim((string)($_POST['Status'] ?? 'new')) ?: 'new';

        if ($details === '') {
            respond_json(['status' => 'error', 'message' => 'กรุณากรอกรายละเอียดของรายงาน'], 400);
            return;
        }

        $saved = [];
        $uploadDir = realpath(__DIR__ . '/../uploads') ?: (__DIR__ . '/../uploads');
        $baseReportDir = $uploadDir . '/reports';
        if (!is_dir($baseReportDir)) {
            mkdir($baseReportDir, 0755, true);
        }

        // Collect uploaded file info first (do not move yet)
        $filesToSave = [];
        if (!empty($_FILES['files'])) {
            $files = $_FILES['files'];
            $count = is_array($files['name']) ? count($files['name']) : 0;
            for ($i = 0; $i < $count; $i++) {
                $tmp = $files['tmp_name'][$i] ?? null;
                if ($tmp === null || !is_uploaded_file($tmp)) continue;
                $orig = (string)($files['name'][$i] ?? 'file');
                $size = (int)($files['size'][$i] ?? 0);
                $type = (string)($files['type'][$i] ?? '');

                if ($size <= 0) continue;
                if ($size > REPORT_MAX_FILE_SIZE_BYTES) {
                    respond_json([
                        'status' => 'error',
                        'message' => sprintf('ไฟล์ %s ต้องไม่เกิน %dMB', $orig !== '' ? $orig : 'ที่อัปโหลด', REPORT_MAX_FILE_SIZE_MB),
                    ], 422);
                    return;
                }
                $allowed = ['image/jpeg','image/png','image/gif','image/webp'];
                if ($type !== '' && !in_array($type, $allowed, true)) continue;

                $safe = sanitize_filename(pathinfo($orig, PATHINFO_FILENAME));
                $ext = strtolower(pathinfo($orig, PATHINFO_EXTENSION));
                if ($ext === '') $ext = 'jpg';
                $filesToSave[] = ['tmp' => $tmp, 'orig' => $orig, 'safe' => $safe, 'ext' => $ext];
            }
        }

        // Determine center from session if available; fallback to center 1.
        if (function_exists('start_session_if_needed')) {
            start_session_if_needed();
        }
        $center = 1;
        if (isset($_SESSION['user']['Center_Id'])) {
            $center = (int)$_SESSION['user']['Center_Id'];
        }

        // Insert report first to obtain report_id, then create folder and move files there.
        $stmt = $pdo->prepare('INSERT INTO Report (Center_Id, Machine_Id, Details, Status) VALUES (:center, :machine, :details, :status)');
        $stmt->execute([
            ':center' => $center,
            ':machine' => $machineId,
            ':details' => $details,
            ':status' => $status,
        ]);

        $id = (int)$pdo->lastInsertId();

        if (count($filesToSave) > 0) {
            $reportDir = $baseReportDir . '/report' . $id;
            if (!is_dir($reportDir)) {
                mkdir($reportDir, 0755, true);
            }
            foreach ($filesToSave as $f) {
                $final = sprintf('%s_%s.%s', $f['safe'], bin2hex(random_bytes(6)), $f['ext']);
                $dest = $reportDir . '/' . $final;
                if (move_uploaded_file($f['tmp'], $dest)) {
                    $saved[] = '/uploads/reports/report' . $id . '/' . $final;
                }
            }
        }

        respond_json([
            'status' => 'ok',
            'report_id' => $id,
            'photos' => $saved,
        ], 201);
    } catch (Throwable $e) {
        $msg = sprintf("[%s] %s in %s:%d\nStack:\n%s\n\n", date('c'), $e->getMessage(), $e->getFile(), $e->getLine(), $e->getTraceAsString());
        $logFile = __DIR__ . '/../logs/reports-error.log';
        @file_put_contents($logFile, $msg, FILE_APPEND | LOCK_EX);
        respond_json(['status' => 'error', 'message' => $e->getMessage()], 500);
    }

}

function handle_request(): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if ($method === 'POST') {
        handle_post();
        return;
    }
    try {
        $pdo = db_connection();
        if (isset($_GET['id'])) {
            $id = (int)$_GET['id'];
            $stmt = $pdo->prepare('SELECT * FROM Report WHERE Report_Id = ? LIMIT 1');
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) {
                respond_json(['status' => 'error', 'message' => 'ไม่พบข้อมูลรายงานที่ต้องการ'], 404);
                return;
            }
            // Photo is no longer stored in DB; return empty photos array.
            $row['photos'] = [];
            respond_json(['status' => 'ok', 'report' => $row]);
            return;
        }

        $limit = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 50;
        // Exclude Photo column from SELECT since we no longer persist it.
        $sql = 'SELECT Report_Id, Center_Id, Machine_Id, Details, Status, RPCreated_at, Updated_at FROM Report ORDER BY RPCreated_at DESC LIMIT ?';
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = $stmt->fetchAll();
        foreach ($rows as &$r) {
            $r['photos'] = [];
        }
        respond_json(['status' => 'ok', 'items' => $rows]);
    } catch (Throwable $e) {
        respond_json(['status' => 'error', 'message' => $e->getMessage()], 500);
    }
}

if (php_sapi_name() !== 'cli') {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

    if (basename($_SERVER['SCRIPT_NAME'] ?? '') === 'reports.php') {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
            handle_post();
            exit;
        }
        respond_json(['error' => 'ไม่รองรับ method นี้'], 405);
        exit;
    }

    if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
        if ($path === '/api/reports' || $path === '/api/reports.php') {
            if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
                handle_post();
            } else {
                respond_json(['error' => 'ไม่รองรับ method นี้'], 405);
            }
        } else {
            respond_json(['error' => 'ไม่พบ endpoint ที่ร้องขอ'], 404);
        }
        exit;
    }
}