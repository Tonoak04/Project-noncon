<?php

declare(strict_types=1);

require_once __DIR__ . '/../../server/auth.php';

function map_center_user(array $row): array
{
    $roles = resolve_user_roles($row['Role'] ?? null);
    $fullName = trim(sprintf('%s %s', (string)($row['Name'] ?? ''), (string)($row['Lastname'] ?? '')));
    $status = ($row['Updated_at'] ?? null) ? 'active' : 'pending';

    return [
        'id' => (int)($row['Center_Id'] ?? 0),
        'username' => (string)($row['Username'] ?? ''),
        'fullName' => $fullName !== '' ? $fullName : (string)($row['Username'] ?? ''),
        'centerName' => $row['CenterName'] ?? null,
        'role' => $roles[0] ?? null,
        'roles' => $roles,
        'employeeId' => $row['Employee_Id'] ?? null,
        'phone' => $row['Phone'] ?? null,
        'address' => $row['Address'] ?? null,
        'createdAt' => $row['Created_at'] ?? null,
        'updatedAt' => $row['Updated_at'] ?? null,
        'lastLogin' => $row['Last_seen'] ?? $row['Updated_at'] ?? $row['Created_at'] ?? null,
        'status' => $status,
    ];
}

try {
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (strtoupper($method) !== 'GET') {
        json_response(['error' => 'Method Not Allowed'], 405);
        return;
    }

    require_role(['admin']);
    $pdo = db_connection();

    $search = isset($_GET['search']) ? trim((string)$_GET['search']) : '';
    $roleFilter = isset($_GET['role']) ? trim((string)$_GET['role']) : '';
    $centerFilter = isset($_GET['center']) ? trim((string)$_GET['center']) : '';
    $limit = isset($_GET['limit']) ? max(1, min((int)$_GET['limit'], 500)) : 250;

    $sql = 'SELECT Center_Id, Username, CenterName, `Role`, Name, Lastname, Phone, Employee_Id, Address, Created_at, Updated_at, Last_seen FROM Center';
    $conditions = [];
    $params = [];

    if ($search !== '') {
        $conditions[] = '(Username LIKE :search OR CenterName LIKE :search OR Name LIKE :search OR Lastname LIKE :search OR Employee_Id LIKE :search)';
        $params[':search'] = '%' . $search . '%';
    }

    if ($roleFilter !== '') {
        $conditions[] = '`Role` LIKE :role';
        $params[':role'] = '%' . $roleFilter . '%';
    }

    if ($centerFilter !== '') {
        $conditions[] = 'CenterName LIKE :center';
        $params[':center'] = '%' . $centerFilter . '%';
    }

    if ($conditions) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }

    $sql .= ' ORDER BY Updated_at DESC, Created_at DESC, Center_Id DESC LIMIT ' . $limit;

    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $value) {
        $stmt->bindValue($key, $value, PDO::PARAM_STR);
    }
    $stmt->execute();
    $rows = $stmt->fetchAll() ?: [];

    $items = array_map('map_center_user', $rows);
    json_response([
        'items' => $items,
        'count' => count($items),
        'syncedAt' => gmdate('c'),
    ]);
} catch (Throwable $e) {
    error_log('[admin/users] ' . $e->getMessage());
    json_response(['error' => 'Internal error'], 500);
}
