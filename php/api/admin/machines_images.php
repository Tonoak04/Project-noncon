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
            json_response(['error' => 'Missing Machine_Id or Equipment'], 400);
            exit;
        }

        // Determine uploads base for machines and ensure it exists
        $uploadsBase = realpath(__DIR__ . '/../../uploads/machines');
        if ($uploadsBase === false) {
            $uploadsBase = __DIR__ . '/../../uploads/machines';
            if (!is_dir($uploadsBase)) mkdir($uploadsBase, 0755, true);
            $uploadsBase = realpath($uploadsBase) ?: $uploadsBase;
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

        $saved = [];
        $allowedExt = ['jpg','jpeg','png','webp','gif'];
        foreach ($_FILES as $field => $info) {
            if (is_array($info['name'])) {
                $count = count($info['name']);
                for ($i = 0; $i < $count; $i++) {
                    $tmp = $info['tmp_name'][$i] ?? null;
                    $name = $info['name'][$i] ?? null;
                    if (!$tmp || !is_uploaded_file($tmp)) continue;
                    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                    if (!in_array($ext, $allowedExt, true)) continue;
                    $final = uniqid('', true) . '_' . preg_replace('/[^A-Za-z0-9_\-\.]/', '_', $name);
                    $dest = $targetDir . DIRECTORY_SEPARATOR . $final;
                    if (move_uploaded_file($tmp, $dest)) {
                        $rel = str_replace('\\', '/', substr($dest, strlen(realpath(__DIR__ . '/../../uploads')) + 1));
                        $saved[] = '/uploads/' . $rel;
                    }
                }
            } else {
                $tmp = $info['tmp_name'] ?? null;
                $name = $info['name'] ?? null;
                if (!$tmp || !is_uploaded_file($tmp)) continue;
                $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                if (!in_array($ext, $allowedExt, true)) continue;
                $final = uniqid('', true) . '_' . preg_replace('/[^A-Za-z0-9_\-\.]/', '_', $name);
                $dest = $targetDir . DIRECTORY_SEPARATOR . $final;
                if (move_uploaded_file($tmp, $dest)) {
                    $rel = str_replace('\\', '/', substr($dest, strlen(realpath(__DIR__ . '/../../uploads')) + 1));
                    $saved[] = '/uploads/' . $rel;
                }
            }
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
            json_response(['error' => 'Missing path'], 400);
            exit;
        }
        // sanitize: must start with /uploads/machines/
        $norm = preg_replace('#/+#','/', $path);
        if (strpos($norm, '/uploads/machines/') !== 0 && strpos($norm, 'uploads/machines/') !== 0) {
            json_response(['error' => 'Invalid path'], 400);
            exit;
        }
        $uploadsRoot = realpath(__DIR__ . '/../../uploads');
        $full = $uploadsRoot . DIRECTORY_SEPARATOR . ltrim(str_replace('/', DIRECTORY_SEPARATOR, preg_replace('#^/+#','',$norm)), DIRECTORY_SEPARATOR);
        if (!file_exists($full) || !is_file($full)) {
            json_response(['error' => 'File not found'], 404);
            exit;
        }
        $ok = unlink($full);
        if ($ok) json_response(['ok' => true]);
        else json_response(['error' => 'Delete failed'], 500);
        exit;
    }

    json_response(['error' => 'Method Not Allowed'], 405);
} catch (Throwable $e) {
    error_log('[admin/machines_images] ' . $e->getMessage());
    json_response(['error' => 'Internal error'], 500);
}
