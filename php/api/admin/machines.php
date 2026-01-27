<?php
declare(strict_types=1);
require_once __DIR__ . '/../../server/auth.php';

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

    if ($method === 'POST' && isset($_GET['action']) && $_GET['action'] === 'bulk-update') {
        $user = require_role(['admin']);
        if (!isset($input['items']) || !is_array($input['items'])) {
            json_response(['error' => 'Missing items'], 400);
            exit;
        }
        $pdo = db_connection();
        $allowed = ['Equipment','Machine_Type','Company_code','Recipient','Description','Status','License_plate_Number','Class','Assest_Number','Keyword','Note'];
        $updatedRows = [];
        $updatedCount = 0;
        $pdo->beginTransaction();
        try {
            $selectStmt = $pdo->prepare('SELECT * FROM Machines WHERE Machine_Id = ? LIMIT 1');
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
                        $params[$field] = $row[$field];
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
            $pdo->commit();
        } catch (Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }
        json_response(['ok' => true, 'updated' => $updatedCount, 'items' => $updatedRows]);
        exit;
    }

    if ($method === 'POST') {
        $user = require_role(['admin']);
        $fields = ['Equipment','Machine_Type','Company_code','Recipient','Description','Status','License_plate_Number'];
        $data = [];
        foreach ($fields as $f) {
            $data[$f] = isset($input[$f]) ? $input[$f] : null;
        }
        $pdo = db_connection();
        $stmt = $pdo->prepare('INSERT INTO Machines (Equipment, Machine_Type, Company_code, Recipient, Description, Status, License_plate_Number) VALUES (:Equipment, :Machine_Type, :Company_code, :Recipient, :Description, :Status, :License_plate_Number)');
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
        $fields = ['Equipment','Machine_Type','Company_code','Recipient','Description','Status','License_plate_Number'];
        $set = [];
        $params = [];
        foreach ($fields as $f) {
            if (array_key_exists($f, $input)) {
                $set[] = "`$f` = :$f";
                $params[$f] = $input[$f];
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
