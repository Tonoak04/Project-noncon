<?php
$distIndex = __DIR__ . '/frontend/dist/index.html';

if (file_exists($distIndex)) {
    http_response_code(200);
    header('Content-Type: text/html; charset=UTF-8');
    echo file_get_contents($distIndex);
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Studio Space Frontend</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            min-height: 100vh;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #050505;
            color: #f5f5f5;
            text-align: center;
        }
        .panel {
            padding: 2rem;
            border-radius: 1.5rem;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            width: min(90vw, 520px);
        }
        code {
            background: rgba(255, 255, 255, 0.1);
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
        }
        a {
            color: #f7b733;
        }
    </style>
</head>
<body>
    <div class="panel">
        <h1>Frontend กำลังสร้างอยู่</h1>
        <p>ถ้ารันผ่าน <code>docker-compose up --build</code> ระบบจะติดตั้ง npm และ build React ให้อัตโนมัติใน container</p>
        <p>ถ้าเห็นหน้านี้นานผิดปกติ ให้เปิด log ของ container <code>project-noncon-app</code> เพื่อตรวจสอบผลลัพธ์ของคำสั่ง <code>npm install / npm run build</code></p>
        <p>สำหรับการพัฒนาแบบ hot reload ยังสามารถรัน local dev server ได้เอง:</p>
        <ol style="text-align:left">
            <li><code>cd php/frontend &amp;&amp; npm install</code></li>
            <li><code>npm run dev</code> แล้วเข้า <a href="http://localhost:5173" target="_blank" rel="noopener">http://localhost:5173</a></li>
        </ol>
        <p>เมื่อ build เสร็จ หน้า <a href="http://localhost:8080">http://localhost:8080</a> จะโหลด UI อัตโนมัติ</p>
        <p><a href="/status.php">ดูสถานะฐานข้อมูล (status.php)</a></p>
        <p>
            API test links:
            <br/>
            <a href="/api/login" target="_blank" rel="noopener">/api/login</a>
            &nbsp;|&nbsp;
            <a href="/api/me" target="_blank" rel="noopener">/api/me</a>
            &nbsp;|&nbsp;
            <a href="/api/machines" target="_blank" rel="noopener">/api/machines[/:id]</a>
        </p>
    </div>
</body>
</html>