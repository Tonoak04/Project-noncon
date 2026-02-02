<?php

declare(strict_types=1);

require_once __DIR__ . '/../server/auth.php';

function map_directory_user(array $row): array
{
    $fullName = trim(sprintf('%s %s', (string)($row['Name'] ?? ''), (string)($row['Lastname'] ?? '')));
    if ($fullName === '') {
        $fullName = (string)($row['Username'] ?? '');
    }
    $roles = resolve_user_roles($row['Role'] ?? null);
    $primaryRole = $roles[0] ?? null;
    $labelParts = [];
    if ($fullName !== '') {
        $labelParts[] = $fullName;
    }
    if (!empty($row['CenterName'])) {
        $labelParts[] = $row['CenterName'];
    }
    $label = implode(' · ', $labelParts);

    return [
        'id' => (int)($row['Center_Id'] ?? 0),
        'username' => (string)($row['Username'] ?? ''),
        'fullName' => $fullName,
        'roles' => $roles,
        'role' => $primaryRole,
        'employeeId' => $row['Employee_Id'] ?? null,
        'centerName' => $row['CenterName'] ?? null,
        'phone' => $row['Phone'] ?? null,
        'label' => $label !== '' ? $label : $fullName,
    ];
}

function normalize_role_filters($raw): array
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

try {
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    if ($method !== 'GET') {
        json_response(['error' => 'Method Not Allowed'], 405);
        return;
    }

    require_auth();
    $pdo = db_connection();

    $search = isset($_GET['search']) ? trim((string)$_GET['search']) : '';
    $limit = isset($_GET['limit']) ? max(1, min((int)$_GET['limit'], 500)) : 200;
    $roleFilters = normalize_role_filters($_GET['roles'] ?? ($_GET['role'] ?? null));

    $sql = 'SELECT Center_Id, Username, CenterName, `Role`, Name, Lastname, Employee_Id, Phone FROM Center';
    $conditions = [];
    $params = [];

    if ($search !== '') {
        $conditions[] = '(Username LIKE :search OR Name LIKE :search OR Lastname LIKE :search OR CenterName LIKE :search OR Employee_Id LIKE :search)';
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

    if ($conditions) {
        $sql .= ' WHERE ' . implode(' AND ', $conditions);
    }

    $sql .= ' ORDER BY Name ASC, Lastname ASC, Username ASC LIMIT ' . $limit;

    $stmt = $pdo->prepare($sql);
    foreach ($params as $key => $meta) {
        $stmt->bindValue($key, $meta['value'], $meta['type']);
    }
    $stmt->execute();
    $rows = $stmt->fetchAll() ?: [];
    $items = array_map('map_directory_user', $rows);

    json_response([
        'items' => $items,
        'count' => count($items),
        'requestedRoles' => $roleFilters,
    ]);
} catch (Throwable $e) {
    error_log('[users] ' . $e->getMessage());
    json_response(['error' => 'Internal error'], 500);
}
