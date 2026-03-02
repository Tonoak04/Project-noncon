<?php
declare(strict_types=1);
require_once __DIR__ . '/server.php';
require_once __DIR__ . '/auth.php';

// CORS for frontend (vite dev or built app) — allow requesting origin and credentials
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

function json_response(array $payload, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
}

start_session_if_needed();
try {
    // Allow public access to categories summary. Detailed machine listing by type
    // can remain public as well; do not force authentication here so frontend
    // can show categories without login.
    $pdo = db_connection();

    $type = isset($_GET['type']) ? trim((string)$_GET['type']) : '';
    $q = isset($_GET['q']) ? trim((string)$_GET['q']) : '';

    if ($type !== '') {
        $sql = 'SELECT Machine_Id, Machine_Type, Recipient, Equipment, Description, Status, License_plate_Number, MCCreated_at FROM Machines WHERE Machine_Type = ?';
        $params = [$type];
        if ($q !== '') {
            $sql .= ' AND (Equipment LIKE ? OR License_plate_Number LIKE ?)';
            $like = '%' . $q . '%';
            $params[] = $like;
            $params[] = $like;
        }
        $sql .= ' ORDER BY Machine_Id DESC LIMIT 1500';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $rows = $stmt->fetchAll();
        json_response(['items' => $rows]);
        exit;
    }

    $stmt = $pdo->query('SELECT Machine_Type AS type, COUNT(*) AS cnt FROM Machines GROUP BY Machine_Type ORDER BY Machine_Type');
    $types = $stmt->fetchAll();
    json_response(['types' => $types]);
} catch (Throwable $e) {
    json_response(['error' => $e->getMessage()], 500);
}
