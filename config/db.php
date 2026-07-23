<?php
// =====================================================================
// ApexMoto POS — MySQL Database Connection Configuration (XAMPP)
// =====================================================================

$db_host = 'localhost';
$db_name = 'apexmoto_pos';
$db_user = 'root';
$db_pass = ''; // Default XAMPP password is empty

try {
    $pdo = new PDO(
        "mysql:host={$db_host};dbname={$db_name};charset=utf8mb4",
        $db_user,
        $db_pass,
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
} catch (PDOException $e) {
    header('Content-Type: application/json');
    http_response_code(500);
    echo json_encode([
        'error' => true,
        'message' => 'Database Connection Failed: ' . $e->getMessage() . '. Please ensure MySQL is running in XAMPP and the apexmoto_pos database is imported.'
    ]);
    exit;
}
