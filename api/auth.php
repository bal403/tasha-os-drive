<?php
// api/auth.php
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../lib/Database.php';

header('Content-Type: application/json');
session_start();

if (!isset($_SESSION['user_id'])) {
    $_SESSION['user_id']  = 1;
    $_SESSION['role']     = 'admin';
    $_SESSION['username'] = 'admin';
}

$action = $_GET['action'] ?? $_POST['action'] ?? '';

function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

try {
    switch ($action) {

        case 'whoami':
            respond([
                'user_id'  => $_SESSION['user_id'],
                'username' => $_SESSION['username'],
                'role'     => $_SESSION['role'],
            ]);

        case 'switch_user':
            $role = $_POST['role'] ?? 'admin';
            $map  = ['admin' => 1, 'user' => 2, 'guest' => 3];
            if (!isset($map[$role])) respond(['error' => 'Invalid role'], 400);

            // verify user exists in DB
            $stmt = Database::get()->prepare("SELECT * FROM users WHERE id = ?");
            $stmt->execute([$map[$role]]);
            $user = $stmt->fetch();
            if (!$user) respond(['error' => 'User not found'], 404);

            $_SESSION['user_id']  = (int)$user['id'];
            $_SESSION['role']     = $user['role'];
            $_SESSION['username'] = $user['username'];
            respond(['ok' => true, 'role' => $user['role'], 'username' => $user['username']]);

        case 'list_users':
            $users = Database::get()->query("SELECT id, username, role FROM users ORDER BY id")->fetchAll();
            respond(['users' => $users]);

        default:
            respond(['error' => 'Unknown action'], 400);
    }
} catch (Throwable $e) {
    respond(['error' => $e->getMessage()], 500);
}