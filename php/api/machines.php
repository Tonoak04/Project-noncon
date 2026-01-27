<?php
declare(strict_types=1);
require_once __DIR__ . '/../server/machines.php';

$id = null;
if (isset($_GET['id'])) {
    $id = (int)$_GET['id'];
}

if ($id) {
    handle_detail($id);
} else {
    handle_list();
}
