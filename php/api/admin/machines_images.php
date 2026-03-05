<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth.php';
// include server helpers to access DB connection when needed
require_once __DIR__ . '/../server.php';

if (!function_exists('json_response')) {
    function json_response(array $payload, int $code = 200): void
    {
        http_response_code($code);
        header('Content-Type: application/json');
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    }
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

    if ($method === 'OPTIONS') {
        http_response_code(204);
        exit;
    }

    if ($method === 'POST') {
        // upload one or more files for a machine (multipart/form-data)
        $user = require_role(['admin']);
        $machineId = isset($_POST['Machine_Id']) ? trim((string)$_POST['Machine_Id']) : '';
        $equipment = isset($_POST['Equipment']) ? trim((string)$_POST['Equipment']) : '';

        // If equipment not provided, try fetch from DB using Machine_Id
        if ($equipment === '' && $machineId !== '') {
            try {
                $pdo = db_connection();
                $stmt = $pdo->prepare('SELECT Equipment FROM Machines WHERE Machine_Id = ? LIMIT 1');
                $stmt->execute([$machineId]);
                $row = $stmt->fetch();
                if ($row && !empty($row['Equipment'])) {
                    $equipment = trim((string)$row['Equipment']);
                }
            } catch (Throwable $e) {
                error_log('[admin/machines_images] DB lookup Equipment failed: ' . $e->getMessage());
            }
        }

        if ($machineId === '' && $equipment === '') {
            json_response(['error' => 'ไม่พบ Machine_Id หรือ Equipment กรุณาระบุข้อมูลให้ครบถ้วน'], 400);
            exit;
        }

        // Determine uploads base for machines and ensure it exists
        $uploadsRoot = realpath(__DIR__ . '/../../uploads');
        if ($uploadsRoot === false) {
            $uploadsRoot = __DIR__ . '/../../uploads';
            if (!is_dir($uploadsRoot)) mkdir($uploadsRoot, 0755, true);
            $uploadsRoot = realpath($uploadsRoot) ?: $uploadsRoot;
        }

        $uploadsBase = $uploadsRoot . DIRECTORY_SEPARATOR . 'machines';
        if (!is_dir($uploadsBase)) {
            mkdir($uploadsBase, 0755, true);
        }
        $uploadsBaseReal = realpath($uploadsBase);
        if ($uploadsBaseReal !== false) {
            $uploadsBase = $uploadsBaseReal;
        }

        // Choose target directory. Prefer the folder that already contains image files for this vehicle
        $machineDir = $uploadsBase . DIRECTORY_SEPARATOR . ($machineId !== '' ? $machineId : '');
        $equipmentDir = $uploadsBase . DIRECTORY_SEPARATOR . ($equipment !== '' ? $equipment : '');

        $allowedExt = ['jpg','jpeg','png','webp','gif'];
        $dirHasImages = function(string $d) use ($allowedExt) {
            if (!is_dir($d)) return false;
            try {
                $files = scandir($d);
                if ($files === false) return false;
                foreach ($files as $f) {
                    if ($f === '.' || $f === '..') continue;
                    $full = $d . DIRECTORY_SEPARATOR . $f;
                    if (!is_file($full)) continue;
                    $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
                    if (in_array($ext, $allowedExt, true)) return true;
                }
            } catch (Throwable $e) { }
            return false;
        };

        // Prefer the folder that already contains images (so we modify existing folder)
        if ($equipment !== '' && $dirHasImages($equipmentDir)) {
            $targetDir = $equipmentDir;
        } elseif ($machineId !== '' && $dirHasImages($machineDir)) {
            $targetDir = $machineDir;
        } elseif ($equipment !== '' && is_dir($equipmentDir)) {
            // no images but equipment folder exists -> use it
            $targetDir = $equipmentDir;
        } elseif ($machineId !== '' && is_dir($machineDir)) {
            $targetDir = $machineDir;
        } else {
            // neither exists -> create preferred folder: equipment if provided, else machineId
            if ($equipment !== '') $targetDir = $equipmentDir;
            else $targetDir = $machineDir;
            if ($targetDir !== '' && !is_dir($targetDir)) mkdir($targetDir, 0755, true);
        }

        if (!is_dir($targetDir)) {
            mkdir($targetDir, 0755, true);
        }

        $maxFileSizeBytes = 5 * 1024 * 1024;
        $maxFileSizeMb = 5;
        $pendingMoves = [];
        $queueUpload = function ($tmp, $name, $size) use (&$pendingMoves, $allowedExt, $targetDir, $maxFileSizeBytes, $maxFileSizeMb) {
            if (!$tmp || !is_uploaded_file($tmp)) {
                return;
            }
            $ext = strtolower(pathinfo((string)$name, PATHINFO_EXTENSION));
            if (!in_array($ext, $allowedExt, true)) {
                $label = ($name !== null && $name !== '') ? $name : 'ไฟล์';
                json_response(['error' => sprintf('ไฟล์ %s ไม่ใช่รูปภาพที่รองรับ (รองรับ: jpg, jpeg, png, webp, gif)', $label)], 422);
                exit;
            }
            // ตรวจสอบ MIME type จริงจากเนื้อหาไฟล์
            if (function_exists('finfo_open')) {
                $finfo = finfo_open(FILEINFO_MIME_TYPE);
                $realMime = $finfo ? finfo_file($finfo, $tmp) : null;
                if ($finfo) finfo_close($finfo);
                $allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
                if ($realMime !== null && !in_array($realMime, $allowedMimes, true)) {
                    $label = ($name !== null && $name !== '') ? $name : 'ไฟล์';
                    json_response(['error' => sprintf('ไฟล์ %s ไม่ใช่รูปภาพจริง (ตรวจพบประเภท: %s)', $label, $realMime)], 422);
                    exit;
                }
            }
            if ($size <= 0 || $size > $maxFileSizeBytes) {
                $label = ($name !== null && $name !== '') ? $name : 'รูปภาพ';
                json_response(['error' => sprintf('ไฟล์ %s ต้องไม่เกิน %dMB', $label, $maxFileSizeMb)], 422);
                exit;
            }
            $sanitized = preg_replace('/[^A-Za-z0-9_\-\.]/', '_', (string)$name);
            if ($sanitized === '' || $sanitized === null) {
                $sanitized = 'image';
            }
            $final = uniqid('', true) . '_' . $sanitized;
            $pendingMoves[] = [
                'tmp' => $tmp,
                'dest' => $targetDir . DIRECTORY_SEPARATOR . $final,
            ];
        };

        foreach ($_FILES as $field => $info) {
            if (is_array($info['name'])) {
                $count = count($info['name']);
                for ($i = 0; $i < $count; $i++) {
                    $tmp = $info['tmp_name'][$i] ?? null;
                    $name = $info['name'][$i] ?? null;
                    $size = (int)($info['size'][$i] ?? 0);
                    $queueUpload($tmp, $name, $size);
                }
            } else {
                $tmp = $info['tmp_name'] ?? null;
                $name = $info['name'] ?? null;
                $size = (int)($info['size'] ?? 0);
                $queueUpload($tmp, $name, $size);
            }
        }

        $uploadsRootNormalized = str_replace('\\', '/', rtrim($uploadsRoot, DIRECTORY_SEPARATOR));
        $saved = [];
        foreach ($pendingMoves as $item) {
            if (!move_uploaded_file($item['tmp'], $item['dest'])) {
                continue;
            }
            $normalizedDest = str_replace('\\', '/', $item['dest']);
            if (strpos($normalizedDest, $uploadsRootNormalized) === 0) {
                $relative = ltrim(substr($normalizedDest, strlen($uploadsRootNormalized)), '/');
            } else {
                $relative = ltrim($normalizedDest, '/');
            }
            $saved[] = '/uploads/' . $relative;
        }

        // log chosen target and saved files for debugging
        error_log('[admin/machines_images] targetDir=' . ($targetDir ?? '') . ' saved=' . json_encode($saved));
        json_response(['ok' => true, 'files' => $saved]);
        exit;
    }

    if ($method === 'DELETE') {
        $user = require_role(['admin']);
        // accept JSON body with 'path' (relative path under /uploads)
        $raw = file_get_contents('php://input');
        $input = json_decode($raw, true);
        $path = $input['path'] ?? null;
        if (!$path) {
            json_response(['error' => 'ไม่ระบุ path ของไฟล์ที่ต้องการลบ'], 400);
            exit;
        }
        // sanitize: must start with /uploads/machines/
        $norm = preg_replace('#/+#','/', $path);
        if (strpos($norm, '/uploads/machines/') !== 0 && strpos($norm, 'uploads/machines/') !== 0) {
            json_response(['error' => 'path ไม่ถูกต้อง ต้องอยู่ใน /uploads/machines/ เท่านั้น'], 400);
            exit;
        }
        $uploadsRoot = realpath(__DIR__ . '/../../uploads');
        if ($uploadsRoot === false) {
            $uploadsRoot = __DIR__ . '/../../uploads';
        }

        $relativePath = preg_replace('#^/+#','', $norm);
        if (strpos($relativePath, 'uploads/') === 0) {
            $relativePath = substr($relativePath, strlen('uploads/'));
        }
        $relativePath = ltrim($relativePath, '/');
        $full = $uploadsRoot . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
        if (!file_exists($full) || !is_file($full)) {
            json_response(['error' => 'ไม่พบไฟล์ที่ต้องการลบ'], 404);
            exit;
        }
        $ok = unlink($full);
        if ($ok) json_response(['ok' => true]);
        else json_response(['error' => 'ลบไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'], 500);
        exit;
    }

    json_response(['error' => 'ไม่รองรับ method นี้'], 405);
} catch (Throwable $e) {
    error_log('[admin/machines_images] ' . $e->getMessage());
    json_response(['error' => 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง'], 500);
}
