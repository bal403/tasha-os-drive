<?php
// api/disk.php
header('Content-Type: application/json');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/Database.php';

session_start();
$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    $pdo = Database::get();
    switch ($action) {
        case 'bitmap':
            $blocks = $pdo->query("SELECT occupied FROM disk_blocks ORDER BY block_index")->fetchAll(PDO::FETCH_COLUMN);
            $total = count($blocks);
            echo json_encode([
                'total' => $total,
                'block_kb' => defined('BLOCK_SIZE_KB') ? BLOCK_SIZE_KB : 4,
                'blocks' => array_map('intval', $blocks)
            ]);
            break;

        case 'configure':
            if (($_SESSION['role'] ?? 'user') !== 'admin') {
                echo json_encode(['error' => 'Admin only']);
                exit;
            }
            $total = (int)($_POST['total_blocks'] ?? 64);
            $blockKb = (int)($_POST['block_size_kb'] ?? 4);
            
            $pdo->exec("DELETE FROM disk_blocks");
            $stmt = $pdo->prepare("INSERT INTO disk_blocks (block_index, occupied) VALUES (?, 0)");
            for ($i = 0; $i < $total; $i++) {
                $stmt->execute([$i]);
            }
            $pdo->exec("DELETE FROM files");
            
            echo json_encode(['ok' => true]);
            break;

        default:
            echo json_encode(['error' => 'Unknown action']);
            break;
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}