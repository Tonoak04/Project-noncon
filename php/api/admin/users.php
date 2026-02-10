<?php

declare(strict_types=1);

require_once __DIR__ . '/../../server/auth.php';

class AdminUserConflictException extends RuntimeException
{
}

function map_admin_center_user(array $row): array
{
    $fullName = trim(sprintf('%s %s', (string)($row['Name'] ?? ''), (string)($row['Lastname'] ?? '')));
    if ($fullName === '') {
        $fullName = (string)($row['Username'] ?? '');
    }

    $roles = resolve_user_roles($row['Role'] ?? null);

    return [
        'id' => (int)($row['Center_Id'] ?? 0),
        'username' => (string)($row['Username'] ?? ''),
        'fullName' => $fullName,
        'centerName' => $row['CenterName'] ?? null,
        'address' => $row['Address'] ?? null,
        'employeeId' => $row['Employee_Id'] ?? null,
        'phone' => $row['Phone'] ?? null,
        'roles' => $roles,
        'role' => $roles[0] ?? null,
        'createdAt' => $row['Created_at'] ?? null,
        'updatedAt' => $row['Updated_at'] ?? null,
        'lastLogin' => $row['Last_seen'] ?? null,
    ];
}

function normalize_role_filters_admin($raw): array
{
    if ($raw === null) {
        return [];
    }
    $entries = is_array($raw) ? $raw : [$raw];
    $normalized = [];
    foreach ($entries as $entry) {
        $parts = preg_split('/[,;]/', (string)$entry) ?: [];
        foreach ($parts as $part) {
            $value = strtolower(trim($part));
            if ($value === '' || in_array($value, $normalized, true)) {
                continue;
            }
            $normalized[] = $value;
        }
    }
    return array_slice($normalized, 0, 10);
}

function fetch_admin_center_users(PDO $pdo, array $options = []): array
{
    $search = isset($options['search']) ? trim((string)$options['search']) : '';
    $limit = array_key_exists('limit', $options) ? (int)$options['limit'] : 500;
    $limit = $limit > 0 ? min($limit, 1000) : 500;
    $roleFilters = isset($options['roles']) && is_array($options['roles']) ? $options['roles'] : [];
    $ids = isset($options['ids']) ? array_values(array_filter(array_map('intval', (array)$options['ids']), static function ($id): bool {
        return $id > 0;
    })) : [];

    if ($ids) {
        $limit = count($ids);
    }

    $sql = 'SELECT Center_Id, Username, Address, CenterName, `Role`, Name, Lastname, Employee_Id, Phone, Created_at, Updated_at, Last_seen FROM Center';
    $conditions = [];
    $params = [];

    if ($search !== '') {
        $conditions[] = '(
            Username LIKE :search OR
            Name LIKE :search OR
            Lastname LIKE :search OR
            CenterName LIKE :search OR
            Employee_Id LIKE :search OR
            Address LIKE :search
        )';
        $params[':search'] = ['value' => '%' . $search . '%', 'type' => PDO::PARAM_STR];
    }

    if ($roleFilters) {
        $roleClauses = [];
        foreach ($roleFilters as $idx => $role) {
            $param = ':role' . $idx;
            $roleClauses[] = '`Role` LIKE ' . $param;
            $params[$param] = ['value' => '%' . $role . '%', 'type' => PDO::PARAM_STR];
        }
        $conditions[] = '(' . implode(' OR ', $roleClauses) . ')';
    }

    if ($ids) {
        $idClauses = [];
        foreach ($ids as $idx => $id) {
            $param = ':id' . $idx;
            $idClauses[] = 'Center_Id = ' . $param;
            $params[$param] = ['value' => $id, 'type' => PDO::PARAM_INT];
        }
        $conditions[] = '(' . implode(' OR ', $idClauses) . ')';
    }

    if ($conditions) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }

    $sql .= ' ORDER BY Name ASC, Lastname ASC, Username ASC';
    $sql .= ' LIMIT ' . $limit;

    $stmt = $pdo->prepare($sql);
    foreach ($params as $param => $meta) {
        $stmt->bindValue($param, $meta['value'], $meta['type']);
    }
    $stmt->execute();
    $rows = $stmt->fetchAll() ?: [];
    return array_map('map_admin_center_user', $rows);
}

function read_admin_json_payload(): array
{
    $raw = file_get_contents('php://input') ?: '';
    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        throw new InvalidArgumentException('รูปแบบข้อมูลไม่ถูกต้อง (ต้องเป็น JSON)');
    }
    return $payload;
}

function admin_split_full_name(string $fullName): array
{
    $parts = preg_split('/\s+/', trim($fullName)) ?: [];
    if (count($parts) >= 2) {
        $lastName = array_pop($parts);
        $firstName = trim(implode(' ', $parts));
        if ($firstName === '') {
            $firstName = $fullName;
        }
        return [$firstName, $lastName];
    }
    return [$fullName, ''];
}

function admin_normalize_roles($raw): array
{
    $entries = is_array($raw) ? $raw : [$raw];
    $roles = [];
    foreach ($entries as $entry) {
        $value = strtolower(trim((string)$entry));
        if ($value === '' || in_array($value, $roles, true)) {
            continue;
        }
        if (!preg_match('/^[a-z0-9._-]{3,32}$/', $value)) {
            throw new InvalidArgumentException('รูปแบบบทบาทไม่ถูกต้อง');
        }
        $roles[] = $value;
    }
    if (!$roles) {
        throw new InvalidArgumentException('ต้องเลือกบทบาทอย่างน้อย 1 รายการ');
    }
    return $roles;
}

function validate_admin_user_payload(array $payload, bool $requirePassword = true): array
{
    $fullName = trim((string)($payload['fullName'] ?? ''));
    if (mb_strlen($fullName) < 3) {
        throw new InvalidArgumentException('กรุณากรอกชื่อ-นามสกุล');
    }
    [$firstName, $lastName] = admin_split_full_name($fullName);

    $centerName = trim((string)($payload['centerName'] ?? ''));
    if ($centerName === '') {
        throw new InvalidArgumentException('กรุณากรอกชื่อศูนย์/หน่วยงาน');
    }
    if (mb_strlen($centerName) > 255) {
        throw new InvalidArgumentException('ชื่อศูนย์ยาวเกินไป');
    }

    $address = trim((string)($payload['address'] ?? ''));
    if ($address === '') {
        throw new InvalidArgumentException('กรุณากรอกที่อยู่');
    }
    if (mb_strlen($address) > 255) {
        throw new InvalidArgumentException('ที่อยู่ยาวเกินไป');
    }

    $username = trim((string)($payload['username'] ?? ''));
    if (!preg_match('/^[a-z0-9._-]{4,24}$/i', $username)) {
        throw new InvalidArgumentException('Username ต้องมี 4-24 ตัวอักษร (a-z, 0-9, . _ -)');
    }

    $employeeId = trim((string)($payload['employeeId'] ?? ''));
    if ($employeeId === '' || strlen($employeeId) > 20) {
        throw new InvalidArgumentException('กรุณากรอกรหัสพนักงาน (ไม่เกิน 20 ตัวอักษร)');
    }

    $phone = trim((string)($payload['phone'] ?? ''));
    if (!preg_match('/^[0-9+\-\s]{7,20}$/', $phone)) {
        throw new InvalidArgumentException('เบอร์โทรไม่ถูกต้อง');
    }

    $roles = admin_normalize_roles($payload['roles'] ?? null);
    $rolesString = implode(',', $roles);
    if (strlen($rolesString) > 128) {
        throw new InvalidArgumentException('จำนวนบทบาทมากเกินไป');
    }

    $password = trim((string)($payload['password'] ?? ''));
    $confirmPassword = trim((string)($payload['confirmPassword'] ?? ''));

    if ($requirePassword && $password === '' && $confirmPassword === '') {
        throw new InvalidArgumentException('รหัสผ่านขั้นต่ำ 8 ตัวอักษร');
    }

    if ($password !== '' || $confirmPassword !== '') {
        if (strlen($password) < 8) {
            throw new InvalidArgumentException('รหัสผ่านขั้นต่ำ 8 ตัวอักษร');
        }
        if ($confirmPassword === '') {
            throw new InvalidArgumentException('กรุณายืนยันรหัสผ่านให้ครบถ้วน');
        }
        if ($password !== $confirmPassword) {
            throw new InvalidArgumentException('รหัสผ่านไม่ตรงกัน');
        }
    }

    $passwordHash = null;
    if ($password !== '') {
        $passwordHash = password_hash($password, PASSWORD_BCRYPT);
        if ($passwordHash === false) {
            throw new RuntimeException('ไม่สามารถเข้ารหัสรหัสผ่านได้');
        }
    } elseif ($requirePassword) {
        throw new InvalidArgumentException('รหัสผ่านขั้นต่ำ 8 ตัวอักษร');
    }

    return [
        'fullName' => $fullName,
        'firstName' => $firstName,
        'lastName' => $lastName,
        'centerName' => $centerName,
        'address' => $address,
        'username' => $username,
        'employeeId' => $employeeId,
        'phone' => $phone,
        'roles' => $roles,
        'rolesString' => $rolesString,
        'passwordHash' => $passwordHash,
    ];
}

function ensure_username_available_admin(PDO $pdo, string $username): void
{
    $stmt = $pdo->prepare('SELECT 1 FROM Center WHERE Username = ? LIMIT 1');
    $stmt->execute([$username]);
    if ($stmt->fetchColumn()) {
        throw new AdminUserConflictException('Username นี้ถูกใช้งานแล้ว');
    }
}

function ensure_username_available_admin_for_update(PDO $pdo, string $username, int $id): void
{
    $stmt = $pdo->prepare('SELECT Center_Id FROM Center WHERE Username = :username AND Center_Id <> :id LIMIT 1');
    $stmt->execute([
        ':username' => $username,
        ':id' => $id,
    ]);
    if ($stmt->fetchColumn()) {
        throw new AdminUserConflictException('Username นี้ถูกใช้งานแล้ว');
    }
}

function insert_admin_center_user(PDO $pdo, array $data): array
{
    if (!isset($data['passwordHash']) || !is_string($data['passwordHash']) || $data['passwordHash'] === '') {
        throw new InvalidArgumentException('ไม่พบรหัสผ่านสำหรับผู้ใช้ใหม่');
    }
    $stmt = $pdo->prepare('INSERT INTO Center (
        Username, Password, Address, CenterName, `Role`, Name, Lastname, Phone, Employee_Id
    ) VALUES (
        :username, :password, :address, :centerName, :roles, :firstName, :lastName, :phone, :employeeId
    )');

    $stmt->execute([
        ':username' => $data['username'],
        ':password' => $data['passwordHash'],
        ':address' => $data['address'],
        ':centerName' => $data['centerName'],
        ':roles' => $data['rolesString'],
        ':firstName' => $data['firstName'],
        ':lastName' => $data['lastName'],
        ':phone' => $data['phone'],
        ':employeeId' => $data['employeeId'],
    ]);

    $newId = (int)$pdo->lastInsertId();
    $users = fetch_admin_center_users($pdo, ['ids' => [$newId], 'limit' => 1]);
    if (!$users) {
        throw new RuntimeException('ไม่สามารถอ่านข้อมูลผู้ใช้ที่เพิ่งสร้างได้');
    }
    return $users[0];
}

function update_admin_center_user(PDO $pdo, int $id, array $data): array
{
    $existsStmt = $pdo->prepare('SELECT 1 FROM Center WHERE Center_Id = :id LIMIT 1');
    $existsStmt->execute([':id' => $id]);
    if (!$existsStmt->fetchColumn()) {
        throw new InvalidArgumentException('ไม่พบผู้ใช้งานที่ต้องการแก้ไข');
    }

    $setParts = [
        'Username = :username',
        'Address = :address',
        'CenterName = :centerName',
        '`Role` = :roles',
        'Name = :firstName',
        'Lastname = :lastName',
        'Phone = :phone',
        'Employee_Id = :employeeId',
        'Updated_at = CURRENT_TIMESTAMP',
    ];

    $params = [
        ':id' => $id,
        ':username' => $data['username'],
        ':address' => $data['address'],
        ':centerName' => $data['centerName'],
        ':roles' => $data['rolesString'],
        ':firstName' => $data['firstName'],
        ':lastName' => $data['lastName'],
        ':phone' => $data['phone'],
        ':employeeId' => $data['employeeId'],
    ];

    if (isset($data['passwordHash']) && is_string($data['passwordHash']) && $data['passwordHash'] !== '') {
        $setParts[] = 'Password = :password';
        $params[':password'] = $data['passwordHash'];
    }

    $sql = 'UPDATE Center SET ' . implode(', ', $setParts) . ' WHERE Center_Id = :id LIMIT 1';
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);

    $users = fetch_admin_center_users($pdo, ['ids' => [$id], 'limit' => 1]);
    if (!$users) {
        throw new RuntimeException('ไม่สามารถอ่านข้อมูลผู้ใช้ที่แก้ไขได้');
    }
    return $users[0];
}

function handle_admin_users_get(PDO $pdo): void
{
    $search = isset($_GET['search']) ? trim((string)$_GET['search']) : '';
    $limit = isset($_GET['limit']) ? max(1, min((int)$_GET['limit'], 1000)) : 500;
    $roleFilters = normalize_role_filters_admin($_GET['roles'] ?? ($_GET['role'] ?? null));

    $items = fetch_admin_center_users($pdo, [
        'search' => $search,
        'limit' => $limit,
        'roles' => $roleFilters,
    ]);

    json_response([
        'items' => $items,
        'count' => count($items),
        'requestedRoles' => $roleFilters,
        'syncedAt' => date(DATE_ATOM),
    ]);
}

function handle_admin_users_post(PDO $pdo): void
{
    $payload = read_admin_json_payload();
    $data = validate_admin_user_payload($payload);
    ensure_username_available_admin($pdo, $data['username']);
    $user = insert_admin_center_user($pdo, $data);
    json_response(['ok' => true, 'user' => $user], 201);
}

function handle_admin_users_patch(PDO $pdo): void
{
    $payload = read_admin_json_payload();
    $id = isset($payload['id']) ? (int)$payload['id'] : 0;
    if ($id <= 0) {
        throw new InvalidArgumentException('ไม่พบผู้ใช้งานที่ต้องการแก้ไข');
    }

    $data = validate_admin_user_payload($payload, false);
    ensure_username_available_admin_for_update($pdo, $data['username'], $id);
    $user = update_admin_center_user($pdo, $id, $data);
    json_response(['ok' => true, 'user' => $user]);
}

function handle_admin_users_delete(PDO $pdo): void
{
    $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
    if ($id <= 0) {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw !== '') {
            $payload = json_decode($raw, true);
            if (is_array($payload)) {
                $id = isset($payload['id']) ? (int)$payload['id'] : 0;
            }
        }
    }

    if ($id <= 0) {
        throw new InvalidArgumentException('กรุณาระบุผู้ใช้งานที่จะลบ');
    }

    $stmt = $pdo->prepare('DELETE FROM Center WHERE Center_Id = :id LIMIT 1');
    $stmt->execute([':id' => $id]);

    if ($stmt->rowCount() === 0) {
        throw new InvalidArgumentException('ไม่พบผู้ใช้งานที่ต้องการลบ');
    }

    json_response(['ok' => true, 'deletedId' => $id]);
}

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    require_role(['admin']);
    $pdo = db_connection();

    if ($method === 'GET') {
        handle_admin_users_get($pdo);
    } elseif ($method === 'POST') {
        handle_admin_users_post($pdo);
    } elseif ($method === 'PATCH' || $method === 'PUT') {
        handle_admin_users_patch($pdo);
    } elseif ($method === 'DELETE') {
        handle_admin_users_delete($pdo);
    } else {
        json_response(['error' => 'Method Not Allowed'], 405);
    }
} catch (InvalidArgumentException $e) {
    json_response(['error' => $e->getMessage()], 400);
} catch (AdminUserConflictException $e) {
    json_response(['error' => $e->getMessage()], 409);
} catch (Throwable $e) {
    error_log('[admin/users] ' . $e->getMessage());
    json_response(['error' => 'Internal server error'], 500);
}
