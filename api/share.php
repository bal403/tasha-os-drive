<?php
// api/share.php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/FileSystem.php';

header('Content-Type: application/json');
session_start();
if (!isset($_SESSION['user_id'])) {
    $_SESSION['user_id'] = 1; $_SESSION['role'] = 'admin'; $_SESSION['username'] = 'admin';
}

$fs     = new FileSystem();
$action = $_GET['action'] ?? $_POST['action'] ?? '';
function respond($data, $code = 200) { http_response_code($code); echo json_encode($data); exit; }

try {
    switch ($action) {

        case 'share':
        case 'share_dir':
            $id        = (int)($_POST['resource_id'] ?? $_POST['dir_id'] ?? 0);
            $type      = $_POST['resource_type'] ?? 'directory';
            $inputRole = $_POST['target_user'] ?? $_POST['role'] ?? 'user';
            
            // Ligtas na i-map ang role para sumunod sa database CHECK constraint ('admin', 'user', 'guest', 'public')
            $role = in_array($inputRole, ['admin', 'user', 'guest', 'public'], true) ? $inputRole : 'user';
            $perm = $_POST['permission'] ?? 'r--';
            
            if (!$id) respond(['error' => 'resource_id or dir_id required'], 400);
            
            $fs->share($id, $type, $role, $perm);
            respond(['ok' => true]);

        case 'unshare':
            $id = (int)($_POST['share_id'] ?? 0);
            $fs->unshare($id);
            respond(['ok' => true]);

        case 'list':
            $id   = (int)($_GET['resource_id'] ?? 0);
            $type = $_GET['resource_type'] ?? 'file';
            $stmt = Database::get()->prepare("SELECT * FROM shares WHERE resource_type=? AND resource_id=? ORDER BY created_at DESC");
            $stmt->execute([$type, $id]);
            respond(['shares' => $stmt->fetchAll()]);

        case 'shared_with_me':
            $role = $_SESSION['role'] ?? 'user';
            $username = $_SESSION['username'] ?? '';
            $items = $fs->listSharedWith($role, $username);
            echo json_encode(['items' => $items]);
            exit;

        case 'toggle_public':
        case 'public_dir':
            $id   = (int)($_POST['resource_id'] ?? $_POST['dir_id'] ?? 0);
            $type = $_POST['resource_type'] ?? 'directory';
            $val  = (int)($_POST['is_public'] ?? 1);
            $table = $type === 'file' ? 'files' : 'directories';
            
            Database::get()->prepare("UPDATE $table SET is_public = ? WHERE id = ?")->execute([$val, $id]);
            respond(['ok' => true, 'is_public' => $val]);

        default:
            respond(['error' => 'Unknown action: ' . $action], 400);
    }
} catch (Throwable $e) { respond(['error' => $e->getMessage()], 500); }