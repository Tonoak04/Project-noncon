<?php
declare(strict_types=1);

require_once __DIR__ . '/server.php';
require_once __DIR__ . '/auth.php';

// CORS: allow the requesting origin and credentials so the frontend (vite/dev or built)
// can call this API with `credentials: include` when needed.
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

if (!function_exists('json_response')) {
    function json_response(array $payload, int $code = 200): void
    {
        http_response_code($code);
        header('Content-Type: application/json');
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    }
}

function list_machines(PDO $pdo, ?int $limit = null): array
{
    $cols = [
        'Machine_Id', 'Machine_Type', 'Company_code', 'Recipient', 'Equipment', 'Description',
        'Status', 'Specification', 'Chassis_Number', 'Engine_Serial_Number', 'Engine_Model',
        'Engine_Power', 'Engine_Capacity', 'License_plate_Number', 'Tax', 'Insurance',
        'Duties', 'Note', 'Class', 'Assest_Number', 'Manufacture', 'Keyword', 'Registered', 'MCCreated_at'
    ];
    $select = implode(', ', $cols);

    if ($limit !== null && $limit > 0) {
        $sql = "SELECT $select FROM Machines ORDER BY Machine_Id DESC LIMIT ?";
        $stmt = $pdo->prepare($sql);
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();
        return $stmt->fetchAll();
    }

    $stmt = $pdo->query("SELECT $select FROM Machines ORDER BY Machine_Id DESC");
    return $stmt->fetchAll();
}

function get_machine(PDO $pdo, int $id): ?array
{
    $stmt = $pdo->prepare('SELECT * FROM Machines WHERE Machine_Id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    return $row ?: null;
}

function handle_list(): void
{
    // Public listing: frontend pages should be able to fetch machine lists without login.
    try {
        $pdo = db_connection();
        $limit = null;
        if (isset($_GET['limit'])) {
            $l = (int)$_GET['limit'];
            if ($l > 0) {
                $limit = min($l, 5000); 
            }
        }

        json_response(['items' => list_machines($pdo, $limit)]);
    } catch (Throwable $e) {
        json_response(['error' => $e->getMessage()], 500);
    }
}

function handle_detail(int $id): void
{
    require_auth();
    try {
        $pdo = db_connection();
        $item = get_machine($pdo, $id);
        if (!$item) {
            json_response(['error' => 'Not found'], 404);
            return;
        }
        $uploadsBase = realpath(__DIR__ . '/../uploads/machines');
        $images = [];
        if ($uploadsBase && is_dir($uploadsBase)) {
            $allowedExt = ['jpg','jpeg','png','webp','gif'];
            $equipment = trim((string)($item['Equipment'] ?? ''));
            $machineId = (string)($item['Machine_Id'] ?? $id);

            $collectFromDir = function(string $dir) use ($uploadsBase, &$images, $allowedExt) {
                if (!is_dir($dir)) return;
                try {
                    $files = scandir($dir);
                    if ($files === false) return;
                    foreach ($files as $f) {
                        if ($f === '.' || $f === '..') continue;
                        $full = $dir . DIRECTORY_SEPARATOR . $f;
                        if (!is_file($full)) continue;
                        $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
                        if (!in_array($ext, $allowedExt, true)) continue;
                        $relPath = str_replace('\\', '/', substr($full, strlen($uploadsBase) + 1));
                        $images[] = ['/uploads/machines/' . $relPath, 'filename' => $f];
                    }
                } catch (Throwable $e) {
                }
            };

            $topMachineDir = $uploadsBase . DIRECTORY_SEPARATOR . $machineId;
            if (is_dir($topMachineDir)) {
                $collectFromDir($topMachineDir);
            }

            if ($equipment !== '' && $equipment !== $machineId) {
                $topEquipmentDir = $uploadsBase . DIRECTORY_SEPARATOR . $equipment;
                if (is_dir($topEquipmentDir)) {
                    if (empty($images)) $collectFromDir($topEquipmentDir);
                }
            }
            $images = array_values(array_unique($images, SORT_REGULAR));
            if (count($images) > 20) $images = array_slice($images, 0, 20);
        }

        if (!empty($images)) {
            $item['images'] = array_map(function($i){ return ['url' => $i[0], 'filename' => $i['filename'] ?? basename($i[0])]; }, $images);
        }

        json_response(['item' => $item]);
    } catch (Throwable $e) {
        json_response(['error' => $e->getMessage()], 500);
    }
}
if (php_sapi_name() !== 'cli') {
    if (isset($_GET['id'])) {
        handle_detail((int)$_GET['id']);
        exit;
    }

    if (basename($_SERVER['SCRIPT_NAME'] ?? '') === 'machines.php') {
        handle_list();
        exit;
    }

    if (realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
        if ($path === '/api/machines') {
            handle_list();
        } elseif (preg_match('#^/api/machines/(\d+)$#', $path, $m)) {
            handle_detail((int)$m[1]);
        } else {
            json_response(['error' => 'Not Found'], 404);
        }
    }
}
