<?php
// api/files.php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/Database.php';
require_once __DIR__ . '/../lib/FileSystem.php';
require_once __DIR__ . '/../lib/Permissions.php';

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

        case 'create':
            $name  = trim($_POST['filename'] ?? '');
            $size  = max(1, (int)($_POST['size_kb'] ?? 1));
            $alloc = $_POST['allocation_type'] ?? 'contiguous';
            if ($name === '') respond(['error' => 'Filename required'], 400);
            if (!in_array($alloc, ['contiguous', 'linked', 'indexed'], true)) respond(['error' => 'Invalid allocation type'], 400);

            $parent = (int)($_POST['parent_id'] ?? 1);
            $stmt = Database::get()->prepare("SELECT id FROM files WHERE filename = ? AND parent_id = ? AND is_trashed = 0");
            $stmt->execute([$name, $parent]);
            if ($stmt->fetch()) respond(['error' => 'File already exists'], 409);

            $ext = pathinfo($name, PATHINFO_EXTENSION) ?: null;
            $res = $fs->createFile([
                'filename'        => $name,
                'extension'       => $ext,
                'content'         => $_POST['content'] ?? '',
                'size_kb'         => $size,
                'allocation_type' => $alloc,
                'parent_id'       => $parent,
                'owner_id'        => (int)$_SESSION['user_id'],
                'perm_admin'      => $_POST['perm_admin'] ?? 'rwx',
                'perm_user'       => $_POST['perm_user']  ?? 'rw-',
                'perm_guest'      => $_POST['perm_guest'] ?? 'r--',
            ]);
            respond($res, $res['ok'] ? 200 : 400);

        case 'upload':
            $name    = trim($_POST['filename'] ?? '');
            if ($name === '') respond(['error' => 'filename required'], 400);
            $sizeKb  = (int)($_POST['size_kb'] ?? 0);
            $content = $_POST['content'] ?? '';
            $alloc   = $_POST['allocation_type'] ?? 'linked';
            $parent  = (int)($_POST['parent_id'] ?? 1);
            if ($sizeKb <= 0) $sizeKb = max(1, (int)ceil(strlen($content) / 1024));

            $ext = pathinfo($name, PATHINFO_EXTENSION) ?: null;
            $attempts = array_values(array_unique([$alloc, 'linked', 'indexed']));
            $lastErr = 'No allocation possible';
            foreach ($attempts as $a) {
                $res = $fs->createFile([
                    'filename' => $name, 'extension' => $ext,
                    'content' => $content, 'size_kb' => $sizeKb,
                    'allocation_type' => $a, 'parent_id' => $parent,
                    'owner_id' => (int)$_SESSION['user_id'],
                    'perm_admin' => 'rwx', 'perm_user' => 'rw-', 'perm_guest' => 'r--',
                ]);
                if ($res['ok']) { $res['allocation_used'] = $a; respond($res); }
                $lastErr = $res['error'] ?? $lastErr;
            }
            respond(['error' => $lastErr], 400);

        case 'read':
            $id  = (int)($_GET['file_id'] ?? 0);
            $res = $fs->readFile($id, $_SESSION['role']);
            if ($res['ok']) {
                $res['path']      = $fs->filePath($id);
                $res['can_write'] = Permissions::can($_SESSION['role'], $res['file'], 'w');
                $res['can_exec']  = Permissions::can($_SESSION['role'], $res['file'], 'x');
            }
            respond($res, $res['ok'] ? 200 : 403);

        // 🛡️ DITO IDINAGDAG ANG EDIT / SAVE FUNCTION NA MAY PERMISSION CHECK
        case 'edit':
            $id      = (int)($_POST['file_id'] ?? 0);
            $content = $_POST['content'] ?? '';
            
            $f = Database::get()->query("SELECT * FROM files WHERE id = $id AND is_trashed = 0")->fetch();
            if (!$f) respond(['error' => 'File not found'], 404);

            // Suriin kung ang kasalukuyang role ay may Write (w) permission
            if ($_SESSION['role'] !== 'admin' && !Permissions::can($_SESSION['role'], $f, 'w')) {
                respond(['error' => 'Access Denied: You do not have Write (w) permission to edit this file.'], 403);
            }

            $sizeKb = max(1, (int)ceil(strlen($content) / 1024));
            $stmt = Database::get()->prepare("UPDATE files SET content = ?, size_kb = ? WHERE id = ?");
            $stmt->execute([$content, $sizeKb, $id]);
            
            respond(['ok' => true]);

        case 'delete':
            $id = (int)($_POST['file_id'] ?? 0);
            $f  = Database::get()->query("SELECT * FROM files WHERE id = $id")->fetch();
            if (!$f) respond(['error' => 'Not found'], 404);
            if ($_SESSION['role'] !== 'admin' && !Permissions::can($_SESSION['role'], $f, 'w')) {
                respond(['error' => 'Access Denied: Permission denied (write)'], 403);
            }
            $fs->trashFile($id);
            respond(['ok' => true, 'trashed' => true]);

        case 'restore':
            $id = (int)($_POST['file_id'] ?? 0);
            $ok = $fs->restoreFile($id);
            respond(['ok' => $ok]);

        case 'delete_forever':
            $id = (int)($_POST['file_id'] ?? 0);
            if ($_SESSION['role'] !== 'admin') respond(['error' => 'Admin only'], 403);
            $fs->deleteFile($id);
            respond(['ok' => true, 'freed' => true]);

        case 'list_trash':
            respond($fs->listTrash());

        case 'list_public':
            respond($fs->listPublicFiles());

        case 'move':
            $id     = (int)($_POST['file_id'] ?? 0);
            $newPid = (int)($_POST['parent_id'] ?? 1);
            $f      = Database::get()->query("SELECT * FROM files WHERE id = $id")->fetch();
            if (!$f) respond(['error' => 'Not found'], 404);
            if ($_SESSION['role'] !== 'admin' && !Permissions::can($_SESSION['role'], $f, 'w')) {
                respond(['error' => 'Access Denied: Permission denied (write)'], 403);
            }
            Database::get()->prepare("UPDATE files SET parent_id = ? WHERE id = ?")->execute([$newPid, $id]);
            respond(['ok' => true]);

        case 'rename':
            $id      = (int)($_POST['file_id'] ?? 0);
            $newName = trim($_POST['filename'] ?? '');
            if ($newName === '') respond(['error' => 'New filename required'], 400);
            $f = Database::get()->query("SELECT * FROM files WHERE id = $id")->fetch();
            if (!$f) respond(['error' => 'Not found'], 404);
            if ($_SESSION['role'] !== 'admin' && !Permissions::can($_SESSION['role'], $f, 'w')) {
                respond(['error' => 'Access Denied: Permission denied (write)'], 403);
            }
            $ext = pathinfo($newName, PATHINFO_EXTENSION) ?: null;
            Database::get()->prepare("UPDATE files SET filename = ?, extension = ? WHERE id = ?")->execute([$newName, $ext, $id]);
            respond(['ok' => true]);

        case 'chmod':
            $id = (int)($_POST['file_id'] ?? 0);
            if ($_SESSION['role'] !== 'admin') respond(['error' => 'Only admin can chmod'], 403);
            $f = Database::get()->query("SELECT * FROM files WHERE id = $id")->fetch();
            if (!$f) respond(['error' => 'Not found'], 404);
            Database::get()->prepare("UPDATE files SET perm_admin = ?, perm_user = ?, perm_guest = ? WHERE id = ?")->execute([
                $_POST['perm_admin'] ?? $f['perm_admin'],
                $_POST['perm_user']  ?? $f['perm_user'],
                $_POST['perm_guest'] ?? $f['perm_guest'],
                $id,
            ]);
            respond(['ok' => true]);

        case 'blocks':
            $id = (int)($_GET['file_id'] ?? 0);
            $f  = Database::get()->query("SELECT * FROM files WHERE id = $id")->fetch();
            if (!$f) respond(['error' => 'Not found'], 404);
            respond([
                'file'        => $f,
                'blocks'      => json_decode($f['allocated_blocks'], true) ?: [],
                'index_block' => $f['index_block'],
            ]);

        case 'download':
            $id = (int)($_GET['file_id'] ?? 0);
            $f  = Database::get()->query("SELECT * FROM files WHERE id = $id")->fetch();
            if (!$f) { http_response_code(404); exit; }
            header('Content-Disposition: attachment; filename="' . $f['filename'] . '"');
            header('Content-Type: text/plain');
            echo $f['content'] ?: "(empty virtual file, {$f['size_kb']} KB simulated)";
            exit;

        default:
            respond(['error' => 'Unknown action'], 400);
    }
} catch (Throwable $e) { respond(['error' => $e->getMessage()], 500); }