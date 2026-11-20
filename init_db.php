<?php
 require __DIR__ . '/config.php';

$pdo = new PDO('sqlite:' . DB_PATH);
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$pdo->exec('PRAGMA foreign_keys = ON');

$pdo->exec("
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','user','guest'))
);

CREATE TABLE IF NOT EXISTS directories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    parent_id INTEGER NULL,
    owner_id INTEGER NOT NULL,
    is_root INTEGER DEFAULT 0,
    is_public INTEGER DEFAULT 0,
    is_trashed INTEGER DEFAULT 0,
    trashed_at DATETIME NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(parent_id) REFERENCES directories(id) ON DELETE CASCADE,
    FOREIGN KEY(owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    extension TEXT,
    content TEXT,
    size_kb INTEGER NOT NULL,
    allocation_type TEXT NOT NULL CHECK(allocation_type IN ('contiguous','linked','indexed')),
    allocated_blocks TEXT,
    index_block INTEGER,
    parent_id INTEGER NOT NULL,
    owner_id INTEGER NOT NULL,
    perm_admin TEXT DEFAULT 'rwx',
    perm_user TEXT DEFAULT 'rw-',
    perm_guest TEXT DEFAULT 'r--',
    is_public INTEGER DEFAULT 0,
    is_trashed INTEGER DEFAULT 0,
    trashed_at DATETIME NULL,
    original_parent_id INTEGER NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(parent_id) REFERENCES directories(id) ON DELETE CASCADE,
    FOREIGN KEY(owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS shares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resource_type TEXT NOT NULL CHECK(resource_type IN ('file','directory')),
    resource_id INTEGER NOT NULL,
    shared_with_role TEXT NOT NULL CHECK(shared_with_role IN ('admin','user','guest','public')),
    permission TEXT DEFAULT 'r--',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS disk_config (
    id INTEGER PRIMARY KEY CHECK(id=1),
    total_blocks INTEGER NOT NULL,
    block_size_kb INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS disk_blocks (
    block_index INTEGER PRIMARY KEY,
    occupied INTEGER DEFAULT 0,
    file_id INTEGER NULL,
    FOREIGN KEY(file_id) REFERENCES files(id) ON DELETE SET NULL
);
");

$pdo->exec("INSERT OR IGNORE INTO users(id, username, role) VALUES
    (1, 'admin',   'admin'),
    (2, 'juan',    'user'),
    (3, 'guest',   'guest')");

$pdo->exec("INSERT OR IGNORE INTO disk_config(id, total_blocks, block_size_kb) VALUES (1, " . TOTAL_BLOCKS . ", " . BLOCK_SIZE_KB . ")");

$stmt = $pdo->prepare("INSERT OR IGNORE INTO disk_blocks(block_index, occupied) VALUES (?, 0)");
for ($i = 0; $i < TOTAL_BLOCKS; $i++) $stmt->execute([$i]);

$pdo->exec("INSERT OR IGNORE INTO directories(id, name, parent_id, owner_id, is_root) VALUES (1, '/', NULL, 1, 1)");

echo "Database initialized successfully (schema v2 with shares + trash).\n";