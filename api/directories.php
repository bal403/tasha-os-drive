<?php
// api/directories.php
header('Content-Type: application/json');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/FileSystem.php';
require_once __DIR__ . '/../lib/Permissions.php';

session_start();
$role = $_SESSION['role'] ?? 'admin';
$fs = new FileSystem();

$action = $_GET['action'] ?? $_POST['action'] ?? '';

try {
    switch ($action) {
        case 'list':
            $dirId = (int)($_GET['dir_id'] ?? 1);
            $res = $fs->listDirectory($dirId);
            $path = $fs->buildPath($dirId);
            echo json_encode(['directories' => $res['directories'], 'files' => $res['files'], 'path' => $path]);
            break;

        case 'tree':
            $pdo = Database::get();
            $tree = $pdo->query("SELECT id, name, parent_id, is_root FROM directories WHERE is_trashed = 0 ORDER BY name")->fetchAll();
            echo json_encode(['tree' => $tree]);
            break;

        case 'mkdir':
            $name = trim($_POST['name'] ?? '');
            $parentId = (int)($_POST['parent_id'] ?? 1);
            if ($name === '') {
                echo json_encode(['error' => 'Folder name required']);
                exit;
            }
            $res = $fs->createDirectory($name, $parentId, 1);
            echo json_encode(['ok' => true, 'directory' => $res]);
            break;

        case 'rmdir':
            $dirId = (int)($_POST['dir_id'] ?? $_POST['id'] ?? 0);
            if (!$dirId) {
                echo json_encode(['error' => 'Directory ID required']);
                exit;
            }
            $fs->trashDirectory($dirId);
            echo json_encode(['ok' => true]);
            break;

        case 'restore_dir':
            $dirId = (int)($_POST['dir_id'] ?? $_POST['id'] ?? 0);
            if (!$dirId) {
                echo json_encode(['error' => 'Directory ID required']);
                exit;
            }
            $pdo = Database::get();
            $pdo->prepare("UPDATE directories SET is_trashed = 0, trashed_at = NULL WHERE id = ?")->execute([$dirId]);
            echo json_encode(['ok' => true]);
            break;

        case 'delete_dir_forever':
            $dirId = (int)($_POST['dir_id'] ?? $_POST['id'] ?? 0);
            if ($role !== 'admin') {
                echo json_encode(['error' => 'Admin only']);
                exit;
            }
            if (!$dirId) {
                echo json_encode(['error' => 'Directory ID required']);
                exit;
            }
            $fs->deleteTrashedDirectory($dirId);
            echo json_encode(['ok' => true]);
            break;

        case 'rename_dir':
            $id = (int)($_POST['dir_id'] ?? $_POST['id'] ?? 0);
            $name = trim($_POST['name'] ?? '');
            if ($id === 1 || $name === '') {
                echo json_encode(['error' => 'Invalid request']);
                exit;
            }
            Database::get()->prepare("UPDATE directories SET name = ? WHERE id = ?")->execute([$name, $id]);
            echo json_encode(['ok' => true]);
            break;

        // 🌐 Idinagdag para gumana ang Make Folder Public at Public Files view
        case 'public_dir':
            $dirId = (int)($_POST['dir_id'] ?? 0);
            $val = (int)($_POST['is_public'] ?? 1);
            Database::get()->prepare("UPDATE directories SET is_public = ? WHERE id = ?")->execute([$val, $dirId]);
            echo json_encode(['ok' => true]);
            break;

        case 'list_public':
            $pdo = Database::get();
            $dirs = $pdo->query("SELECT * FROM directories WHERE is_public = 1 AND is_trashed = 0")->fetchAll();
            $files = $pdo->query("SELECT * FROM files WHERE is_public = 1 AND is_trashed = 0")->fetchAll();
            echo json_encode(['directories' => $dirs, 'files' => $files]);
            break;

        default:
            echo json_encode(['error' => 'Unknown action: ' . $action]);
            break;
    }
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}