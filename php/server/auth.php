<?php
declare(strict_types=1);

require_once __DIR__ . '/server.php';

if (!defined('INACTIVITY_TIMEOUT')) {
    define('INACTIVITY_TIMEOUT', 600);
}

if (!function_exists('json_response')) {
    function json_response(array $payload, int $code = 200): void
    {
        http_response_code($code);
        header('Content-Type: application/json');
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    }
}

function start_session_if_needed(): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => false,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }
}

function find_center_user(PDO $pdo, string $username): ?array
{
    $stmt = $pdo->prepare('SELECT Center_Id, Username, Password, CenterName, `Role`, Name, Lastname, Employee_Id FROM Center WHERE Username = ? LIMIT 1');
    $stmt->execute([$username]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// Admin table removed: authentication will use Center table only.

function resolve_user_roles($rawRoles): array
{
    $source = [];
    if (is_array($rawRoles)) {
        $source = $rawRoles;
    } elseif (is_string($rawRoles)) {
        $trimmed = trim($rawRoles);
        if ($trimmed !== '') {
            $firstChar = $trimmed[0];
            if ($firstChar === '[' || $firstChar === '{') {
                $decoded = json_decode($trimmed, true);
                if (is_array($decoded)) {
                    return resolve_user_roles($decoded);
                }
            }
            $parts = preg_split('/[,;|]/', $trimmed);
            $source = $parts && count($parts) ? $parts : [$trimmed];
        }
    } elseif ($rawRoles !== null) {
        $source = [(string)$rawRoles];
    }

    $normalized = [];
    foreach ($source as $entry) {
        $value = strtolower(trim((string)$entry));
        if ($value === '') {
            continue;
        }
        if (!in_array($value, $normalized, true)) {
            $normalized[] = $value;
        }
    }

    if (!$normalized) {
        $normalized[] = 'operator';
    }

    return $normalized;
}

function normalize_session_user(array $user): array
{
    $rolesSource = $user['roles'] ?? ($user['role'] ?? null);
    $roles = resolve_user_roles($rolesSource);
    $user['roles'] = $roles;
    $user['role'] = $roles[0] ?? 'operator';
    return $user;
}

function user_has_role(array $user, string $expectedRole): bool
{
    $roles = $user['roles'] ?? null;
    if (!is_array($roles) || !$roles) {
        $roles = resolve_user_roles($user['role'] ?? null);
    }

    $needle = strtolower(trim($expectedRole));
    foreach ($roles as $role) {
        if (strtolower((string)$role) === $needle) {
            return true;
        }
    }
    return false;
}

function handle_login(): void
{
    start_session_if_needed();

    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);
    if (!is_array($input)) {
        $input = $_POST;
        if (!is_array($input) || (empty($input))) {
            parse_str($raw ?? '', $input);
        }
    }
    $username = trim((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');

    if ($username === '' || $password === '') {
        json_response(['error' => 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน'], 400);
        return;
    }

    try {
        $pdo = db_connection();

        // Authenticate center user only (admin table removed)
        $user = find_center_user($pdo, $username);
        if (!$user) {
            json_response(['error' => 'ไม่พบผู้ใช้'], 404);
            return;
        }

        if (!password_verify($password, $user['Password'])) {
            json_response(['error' => 'พาสเวิร์ดไม่ถูกต้อง'], 401);
            return;
        }

        $touch = $pdo->prepare('UPDATE Center SET Last_seen = NOW() WHERE Center_Id = :id LIMIT 1');
        $touch->execute([':id' => (int)$user['Center_Id']]);

        $displayName = trim(sprintf('%s %s', (string)($user['Name'] ?? ''), (string)($user['Lastname'] ?? '')));
        if ($displayName === '') {
            $displayName = (string)$user['Username'];
        }

        $roles = resolve_user_roles($user['Role'] ?? null);
        $primaryRole = $roles[0] ?? 'operator';

        $_SESSION['user'] = [
            'role' => $primaryRole,
            'roles' => $roles,
            'Center_Id' => (int)$user['Center_Id'],
            'Username' => $user['Username'],
            'CenterName' => $user['CenterName'],
            'name' => $user['Name'] ?? '',
            'lastname' => $user['Lastname'] ?? '',
            'employeeId' => $user['Employee_Id'] ?? null,
            'displayName' => $displayName,
        ];
        // set last activity timestamp for inactivity timeout
        $_SESSION['last_activity'] = time();

        json_response(['ok' => true, 'user' => $_SESSION['user']]);
    } catch (Throwable $e) {
        error_log('[auth] Exception: ' . $e->getMessage());
        json_response(['error' => 'เกิดข้อผิดพลาดภายใน กรุณาติดต่อผู้ดูแลระบบ'], 500);
    }
}

function require_auth(): array
{
    start_session_if_needed();
    if (!isset($_SESSION['user'])) {
        json_response(['error' => 'Unauthorized'], 401);
        exit;
    }

    $now = time();
    if (isset($_SESSION['last_activity']) && is_int($_SESSION['last_activity'])) {
        $inactive = $now - $_SESSION['last_activity'];
        if ($inactive > INACTIVITY_TIMEOUT) {
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
            }
            session_destroy();
            json_response(['error' => 'Session หมดอายุเนื่องจากไม่มีการใช้งาน ( inactivity )'], 401);
            exit;
        }
    }

    $_SESSION['last_activity'] = $now;

    $_SESSION['user'] = normalize_session_user($_SESSION['user']);

    return $_SESSION['user'];
}

function require_role(array $allowedRoles): array
{
    $user = require_auth();
    foreach ($allowedRoles as $r) {
        if (user_has_role($user, (string)$r)) {
            return $user;
        }
    }
    json_response(['error' => 'Forbidden'], 403);
    exit;
}

function handle_me(): void
{
    $user = require_auth();
    json_response(['user' => $user]);
}

function handle_logout(): void
{
    start_session_if_needed();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], $params['secure'], $params['httponly']);
    }
    session_destroy();
    json_response(['ok' => true]);
}

if (php_sapi_name() !== 'cli' && realpath($_SERVER['SCRIPT_FILENAME'] ?? '') === __FILE__) {
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    if ($path === '/api/login') {
        handle_login();
    } elseif ($path === '/api/me') {
        handle_me();
    } elseif ($path === '/api/logout') {
        handle_logout();
    } else {
        json_response(['error' => 'Not Found'], 404);
    }
}
