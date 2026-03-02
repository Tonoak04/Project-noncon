<?php
require_once __DIR__ . '/api/server.php';

$connectionError = null;
$dbInfo = null;
$dbConfig = db_config();

try {
    $pdo = db_connection();
    $health = db_health($pdo);
    $dbInfo = $health['info'];
} catch (Throwable $e) {
    $connectionError = $e->getMessage();
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Database Connectivity Check</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 3rem auto;
            max-width: 600px;
            line-height: 1.5;
        }
        .status {
            padding: 1rem;
            border-radius: 6px;
            margin-bottom: 1rem;
            border: 1px solid #ccc;
        }
        .ok {
            background: #e9f7ef;
            border-color: #27ae60;
            color: #145a32;
        }
        .error {
            background: #fdedec;
            border-color: #c0392b;
            color: #922b21;
        }
        code {
            background: #f4f4f4;
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <h1>Database Connectivity</h1>

    <?php if ($connectionError): ?>
        <div class="status error">
            <strong>Connection failed:</strong>
            <div><?php echo htmlspecialchars($connectionError, ENT_QUOTES, 'UTF-8'); ?></div>
        </div>
    <?php else: ?>
        <div class="status ok">
            <strong>Connected to MySQL successfully.</strong>
            <div>Schema: <code><?php echo htmlspecialchars($dbInfo['current_schema'] ?? 'unknown', ENT_QUOTES, 'UTF-8'); ?></code></div>
            <div>Server time: <code><?php echo htmlspecialchars($dbInfo['server_time'] ?? 'n/a', ENT_QUOTES, 'UTF-8'); ?></code></div>
        </div>
    <?php endif; ?>

    <section>
        <h2>Environment Variables</h2>
        <p>Using the following connection parameters:</p>
        <ul>
            <li>Host: <code><?php echo htmlspecialchars($dbConfig['host'], ENT_QUOTES, 'UTF-8'); ?></code></li>
            <li>Database: <code><?php echo htmlspecialchars($dbConfig['database'], ENT_QUOTES, 'UTF-8'); ?></code></li>
            <li>User: <code><?php echo htmlspecialchars($dbConfig['username'], ENT_QUOTES, 'UTF-8'); ?></code></li>
        </ul>
        <p>Edit <code>docker-compose.yml</code> or container environment variables to change these values.</p>
        <p><a href="/">&#8592; Back to Studio Space</a></p>
    </section>
</body>
</html>
