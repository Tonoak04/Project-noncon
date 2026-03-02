<?php
declare(strict_types=1);
require_once __DIR__ . '/../auth.php';

function normalize_machine_date($value): ?string
{
    if ($value instanceof DateTimeInterface) {
        return $value->format('Y-m-d');
    }
    $str = trim((string)$value);
    if ($str === '') {
        return null;
    }
    $normalized = str_replace(['.', ','], '/', $str);
    $normalized = str_replace('-', '/', $normalized);
    $normalized = preg_replace('/\s+/', '', $normalized);
    if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/', $normalized, $m)) {
        $day = (int)$m[1];
        $month = (int)$m[2];
        $year = (int)$m[3];
        if ($year < 100) {
            $year += ($year >= 70 ? 1900 : 2000);
        }
        if ($year > 2400) {
            $year -= 543;
        }
        if (checkdate($month, $day, $year)) {
            return sprintf('%04d-%02d-%02d', $year, $month, $day);
        }
    }
    try {
        $dt = new DateTime($str);
        return $dt->format('Y-m-d');
    } catch (Throwable $e) {
        return null;
    }
}

function normalize_machine_field(string $field, $value)
{
    if (is_string($value)) {
        $value = trim($value);
    }
    if ($value === '' || $value === null) {
        return null;
    }
    switch ($field) {
        case 'Tax':
        case 'Insurance':
        case 'Registered':
            return normalize_machine_date($value);
        case 'Duties':
            $numeric = preg_replace('/[^0-9.\-]/', '', (string)$value);
            return $numeric === '' ? null : (int)round((float)$numeric);
        default:
            return $value;
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
try {
    if ($method === 'GET') {
        $user = require_auth();
        $id = isset($_GET['id']) && is_numeric($_GET['id']) ? (int)$_GET['id'] : null;
        $limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? (int)$_GET['limit'] : 100;
        $pdo = db_connection();
        if ($id) {
            $stmt = $pdo->prepare('SELECT * FROM Machines WHERE Machine_Id = ? LIMIT 1');
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) {
                json_response(['error' => 'Not found'], 404);
                exit;
            }
            json_response(['item' => $row]);
            exit;
        }
        $stmt = $pdo->prepare('SELECT * FROM Machines ORDER BY Machine_Id DESC LIMIT ?');
        $stmt->bindValue(1, $limit, PDO::PARAM_INT);
        $stmt->execute();
        $items = $stmt->fetchAll();
        json_response(['items' => $items]);
        exit;
    }

    // read input JSON for POST/PUT
    $raw = file_get_contents('php://input');
    $input = json_decode($raw, true);
    if (!is_array($input)) {
        parse_str($raw ?: '', $input);
    }

    $machineFields = [
        'Equipment',
        'Machine_Type',
        'Company_code',
        'Recipient',
        'Description',
        'Status',
        'Specification',
        'Chassis_Number',
        'Engine_Serial_Number',
        'Engine_Model',
        'Engine_Power',
        'Engine_Capacity',
        'License_plate_Number',
        'Tax',
        'Insurance',
        'Duties',
        'Note',
        'Class',
        'Assest_Number',
        'Manufacture',
        'Keyword',
        'Registered',
    ];

    if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'bulk-update') {
        $user = require_role(['admin']);
        $hasUpdates = isset($input['items']) && is_array($input['items']);
        $hasInserts = isset($input['newItems']) && is_array($input['newItems']);
        if (!$hasUpdates && !$hasInserts) {
            json_response(['error' => 'Missing items'], 400);
            exit;
        }
        $pdo = db_connection();
        $allowed = $machineFields;
        $updatedRows = [];
        $updatedCount = 0;
        $insertedRows = [];
        $insertedCount = 0;
        $pdo->beginTransaction();
        try {
            $selectStmt = $pdo->prepare('SELECT * FROM Machines WHERE Machine_Id = ? LIMIT 1');
            if ($hasUpdates) {
                foreach ($input['items'] as $row) {
                    if (!is_array($row)) {
                        continue;
                    }
                    $id = isset($row['Machine_Id']) ? (int)$row['Machine_Id'] : 0;
                    if ($id <= 0) {
                        continue;
                    }
                    $set = [];
                    $params = ['Machine_Id' => $id];
                    foreach ($allowed as $field) {
                        if (array_key_exists($field, $row)) {
                            $set[] = "`$field` = :$field";
                            $params[$field] = normalize_machine_field($field, $row[$field]);
                        }
                    }
                    if (empty($set)) {
                        continue;
                    }
                    $sql = 'UPDATE Machines SET ' . implode(', ', $set) . ' WHERE Machine_Id = :Machine_Id';
                    $stmt = $pdo->prepare($sql);
                    $stmt->execute($params);
                    $selectStmt->execute([$id]);
                    $updated = $selectStmt->fetch();
                    if ($updated) {
                        $updatedRows[] = $updated;
                        $updatedCount++;
                    }
                }
            }

            if ($hasInserts) {
                $fieldList = array_values(array_unique(array_merge(['Equipment'], $allowed)));
                $insertStmt = $pdo->prepare(
                    'INSERT INTO Machines (' . implode(', ', $fieldList) . ')
                    VALUES (:' . implode(', :', $fieldList) . ')'
                );
                $selectByEquipmentStmt = $pdo->prepare('SELECT Machine_Id FROM Machines WHERE Equipment = ? LIMIT 1');
                $updateAssignments = array_map(static function ($field) {
                    return "`$field` = :$field";
                }, $fieldList);
                $upsertFromInsertStmt = $pdo->prepare(
                    'UPDATE Machines SET ' . implode(', ', $updateAssignments) . ' WHERE Machine_Id = :Machine_Id'
                );
                foreach ($input['newItems'] as $row) {
                    if (!is_array($row)) {
                        continue;
                    }
                    $equipment = trim((string)($row['Equipment'] ?? ''));
                    if ($equipment === '') {
                        continue;
                    }
                    $selectByEquipmentStmt->execute([$equipment]);
                    $existingId = (int)$selectByEquipmentStmt->fetchColumn();
                    $params = [];
                    foreach ($fieldList as $field) {
                        if ($field === 'Equipment') {
                            $params[$field] = $equipment;
                        } else {
                            $params[$field] = array_key_exists($field, $row)
                                ? normalize_machine_field($field, $row[$field])
                                : null;
                        }
                    }
                    if ($existingId > 0) {
                        $params['Machine_Id'] = $existingId;
                        $upsertFromInsertStmt->execute($params);
                        $selectStmt->execute([$existingId]);
                        $updated = $selectStmt->fetch();
                        if ($updated) {
                            $updatedRows[] = $updated;
                            $updatedCount++;
                        }
                        continue;
                    }

                    $insertStmt->execute($params);
                    $newId = (int)$pdo->lastInsertId();
                    if ($newId > 0) {
                        $selectStmt->execute([$newId]);
                        $inserted = $selectStmt->fetch();
                        if ($inserted) {
                            $insertedRows[] = $inserted;
                            $insertedCount++;
                        }
                    }
                }
            }
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        json_response([
            'ok' => true,
            'updated' => $updatedCount,
            'inserted' => $insertedCount,
            'items' => array_merge($updatedRows, $insertedRows),
        ]);
        exit;
    }

    if ($method === 'POST') {
        $user = require_role(['admin']);
        $fields = $machineFields;
        $data = [];
        foreach ($fields as $f) {
            $data[$f] = array_key_exists($f, $input) ? normalize_machine_field($f, $input[$f]) : null;
        }
        $equipment = trim((string)($data['Equipment'] ?? ''));
        if ($equipment === '') {
            json_response(['error' => 'Equipment is required'], 400);
            exit;
        }
        $pdo = db_connection();
        $columns = implode(', ', array_keys($data));
        $placeholders = ':' . implode(', :', array_keys($data));
        $stmt = $pdo->prepare("INSERT INTO Machines ($columns) VALUES ($placeholders)");
        $stmt->execute($data);
        $id = (int)$pdo->lastInsertId();
        $stmt = $pdo->prepare('SELECT * FROM Machines WHERE Machine_Id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        json_response(['ok' => true, 'item' => $row], 201);
        exit;
    }

    if ($method === 'PUT' || $method === 'PATCH') {
        $user = require_role(['admin']);
        $id = isset($input['Machine_Id']) ? (int)$input['Machine_Id'] : (isset($_GET['id']) ? (int)$_GET['id'] : 0);
        if (!$id) {
            json_response(['error' => 'Missing Machine_Id'], 400);
            exit;
        }
        $fields = $machineFields;
        $set = [];
        $params = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $input)) {
                $set[] = "`$f` = :$f";
                $params[$f] = normalize_machine_field($f, $input[$f]);
            }
        }
        if (empty($set)) {
            json_response(['error' => 'No fields to update'], 400);
            exit;
        }
        $params['Machine_Id'] = $id;
        $sql = 'UPDATE Machines SET ' . implode(', ', $set) . ' WHERE Machine_Id = :Machine_Id';
        $pdo = db_connection();
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $stmt = $pdo->prepare('SELECT * FROM Machines WHERE Machine_Id = ? LIMIT 1');
        $stmt->execute([$id]);
        $row = $stmt->fetch();
        json_response(['ok' => true, 'item' => $row]);
        exit;
    }

    if ($method === 'DELETE') {
        $user = require_role(['admin']);
        $id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
        if (!$id) {
            json_response(['error' => 'Missing id'], 400);
            exit;
        }
        $pdo = db_connection();
        $stmt = $pdo->prepare('DELETE FROM Machines WHERE Machine_Id = ?');
        $stmt->execute([$id]);
        json_response(['ok' => true]);
        exit;
    }

    json_response(['error' => 'Method Not Allowed'], 405);
} catch (Throwable $e) {
    error_log('[admin/machines] ' . $e->getMessage());  
    json_response(['error' => 'Internal error'], 500);
}
