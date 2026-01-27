<?php
declare(strict_types=1);

// Force PHP runtime to operate in Thailand time (UTC+7) for all date operations.
date_default_timezone_set('Asia/Bangkok');

function db_config(): array
{
    return [
        'host' => getenv('DB_HOST') ?: '127.0.0.1',
        'database' => getenv('DB_DATABASE') ?: 'project_noncon',
        'username' => getenv('DB_USERNAME') ?: 'root',
        'password' => getenv('DB_PASSWORD') ?: 'rootpassword',
        'charset' => 'utf8mb4',
    ];
}

function db_connection(): PDO
{
    static $pdo = null;

    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = db_config();
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=%s', $config['host'], $config['database'], $config['charset']);

    $pdo = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    // Ensure MySQL session follows Thailand timezone so NOW()/timestamps are consistent.
    $pdo->exec("SET time_zone = '+07:00'");

    return $pdo;
}

function db_health(PDO $pdo): array
{
    $stmt = $pdo->query('SELECT NOW() AS server_time, DATABASE() AS current_schema');
    $row = $stmt->fetch() ?: [];

    return [
        'status' => 'ok',
        'info' => [
            'server_time' => $row['server_time'] ?? null,
            'current_schema' => $row['current_schema'] ?? null,
        ],
        'config' => [
            'host' => db_config()['host'],
            'database' => db_config()['database'],
            'username' => db_config()['username'],
        ],
    ];
}

function respond_json(array $payload, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json');
    echo json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
}

/**
 * Sanitize a filename (without extension) to a safe ASCII-only base name.
 */
function sanitize_filename(string $name): string
{
    // Replace spaces and control characters with underscore
    $s = preg_replace('/[\s\x00-\x1f\\/\\\\:;"\'`<>\|\?\*]+/u', '_', $name);
    // Transliterate to ASCII where possible
    if (function_exists('transliterator_transliterate')) {
        $s = transliterator_transliterate('Any-Latin; Latin-ASCII', $s);
    }
    // Remove any remaining non-alphanumeric, underscore or dash characters
    $s = preg_replace('/[^A-Za-z0-9_\-]/', '', $s);
    // Collapse multiple underscores
    $s = preg_replace('/_+/', '_', $s);
    // Trim underscores and dashes
    $s = trim($s, '_-');
    if ($s === '') {
        return 'file';
    }
    return strtolower($s);
}

function handle_server_request(): void
{
    try {
        $pdo = db_connection();
        $data = db_health($pdo);
        respond_json($data);
    } catch (Throwable $e) {
        respond_json([
            'status' => 'error',
            'message' => $e->getMessage(),
        ], 500);
    }
}

if (php_sapi_name() !== 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    handle_server_request();
}
