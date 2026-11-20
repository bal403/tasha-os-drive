<?php
// lib/FileSystem.php
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Permissions.php';

class FileSystem {
    private PDO $db;

    public function __construct() {
        $this->db = Database::get();
    }

    /* ============================================================
       HELPERS
       ============================================================ */

    public function freeBlocks(): array {
        $rows = $this->db->query("SELECT block_index FROM disk_blocks WHERE occupied = 0 ORDER BY block_index")->fetchAll();
        return array_map(fn($r) => (int)$r['block_index'], $rows);
    }

    public function bitmap(): array {
        return $this->db->query("SELECT occupied FROM disk_blocks ORDER BY block_index")->fetchAll(PDO::FETCH_COLUMN);
    }

    public function blockCount(): int {
        return (int)$this->db->query("SELECT COUNT(*) FROM disk_blocks")->fetchColumn();
    }

    /* ============================================================
       PATH RESOLUTION
       ============================================================ */

    public function resolvePath(string $path): ?array {
        $path = trim($path, '/');
        if ($path === '') return ['type' => 'directory', 'row' => $this->root()];

        $parts = explode('/', $path);
        $parentId = 1;

        foreach ($parts as $i => $part) {
            $isLast = ($i === count($parts) - 1);
            if ($isLast) {
                $stmt = $this->db->prepare("SELECT * FROM files WHERE filename = ? AND parent_id = ?");
                $stmt->execute([$part, $parentId]);
                $file = $stmt->fetch();
                if ($file) return ['type' => 'file', 'row' => $file];

                $stmt = $this->db->prepare("SELECT * FROM directories WHERE name = ? AND parent_id = ?");
                $stmt->execute([$part, $parentId]);
                $dir = $stmt->fetch();
                if ($dir) return ['type' => 'directory', 'row' => $dir];
                return null;
            } else {
                $stmt = $this->db->prepare("SELECT * FROM directories WHERE name = ? AND parent_id = ?");
                $stmt->execute([$part, $parentId]);
                $dir = $stmt->fetch();
                if (!$dir) return null;
                $parentId = (int)$dir['id'];
            }
        }
        return null;
    }

    public function buildPath(int $dirId): string {
        $parts = [];
        $cur = $dirId;
        $guard = 0;
        while ($cur && $guard++ < 100) {
            $row = $this->db->query("SELECT * FROM directories WHERE id = $cur")->fetch();
            if (!$row) break;
            if ((int)$row['is_root'] === 1) break;
            array_unshift($parts, $row['name']);
            $cur = $row['parent_id'] ? (int)$row['parent_id'] : 0;
        }
        return '/' . implode('/', $parts);
    }

    public function root(): array {
        return $this->db->query("SELECT * FROM directories WHERE is_root = 1 LIMIT 1")->fetch();
    }

    /* ============================================================
       DIRECTORY / FILE LISTING
       ============================================================ */

    public function createDirectory(string $name, int $parentId, int $ownerId): array {
        $stmt = $this->db->prepare("INSERT INTO directories(name, parent_id, owner_id) VALUES (?,?,?)");
        $stmt->execute([$name, $parentId, $ownerId]);
        return ['id' => (int)$this->db->lastInsertId(), 'name' => $name];
    }

    public function listDirectory(int $dirId): array {
        $dirs = $this->db->query("SELECT id, name, created_at FROM directories
            WHERE parent_id = $dirId AND is_root = 0 AND is_trashed = 0 ORDER BY name")->fetchAll();
        $files = $this->db->query("SELECT id, filename, extension, size_kb, allocation_type, is_public, created_at
            FROM files WHERE parent_id = $dirId AND is_trashed = 0 ORDER BY filename")->fetchAll();
        return ['directories' => $dirs, 'files' => $files];
    }

    /* ============================================================
       HARD DELETE (frees disk blocks)
       ============================================================ */

    public function deleteFile(int $fileId): void {
        $f = $this->db->query("SELECT allocated_blocks, index_block FROM files WHERE id = $fileId")->fetch();
        if ($f) {
            $blocks = json_decode($f['allocated_blocks'], true) ?: [];
            if ($f['index_block'] !== null && $f['index_block'] !== '') {
                $blocks[] = (int)$f['index_block'];
            }
            $stmt = $this->db->prepare("UPDATE disk_blocks SET occupied=0, file_id=NULL WHERE block_index=?");
            foreach ($blocks as $b) $stmt->execute([$b]);
        }
        $this->db->prepare("DELETE FROM files WHERE id = ?")->execute([$fileId]);
    }

    public function deleteTrashedDirectory(int $id): void {
        $files = $this->db->query("SELECT id FROM files WHERE parent_id = $id")->fetchAll();
        foreach ($files as $f) $this->deleteFile((int)$f['id']);
        $subdirs = $this->db->query("SELECT id FROM directories WHERE parent_id = $id")->fetchAll();
        foreach ($subdirs as $d) $this->deleteTrashedDirectory((int)$d['id']);
        $this->db->prepare("DELETE FROM directories WHERE id = ?")->execute([$id]);
    }

    /* ============================================================
       ALLOCATION ALGORITHMS
       ============================================================ */

    public function allocate(int $needed, string $algorithm): array {
        $free  = $this->freeBlocks();
        $total = $this->blockCount();

        switch ($algorithm) {
            case 'contiguous':
                $bitmap = $this->bitmap();
                $run = 0; $start = -1;
                for ($i = 0; $i < $total; $i++) {
                    if ((int)$bitmap[$i] === 0) {
                        if ($run === 0) $start = $i;
                        $run++;
                        if ($run === $needed) {
                            return ['ok' => true, 'blocks' => range($start, $start + $needed - 1), 'index_block' => null];
                        }
                    } else {
                        $run = 0; $start = -1;
                    }
                }
                return ['ok' => false, 'error' => "Cannot find $needed contiguous free blocks"];

            case 'linked':
                if (count($free) < $needed) return ['ok' => false, 'error' => 'Not enough free blocks'];
                return ['ok' => true, 'blocks' => array_slice($free, 0, $needed), 'index_block' => null];

            case 'indexed':
                if (count($free) < $needed + 1) return ['ok' => false, 'error' => 'Not enough free blocks (needs index block)'];
                $indexBlock = $free[0];
                $dataBlocks = array_slice($free, 1, $needed);
                return ['ok' => true, 'blocks' => $dataBlocks, 'index_block' => $indexBlock];
        }
        return ['ok' => false, 'error' => 'Unknown algorithm'];
    }

    public function createFile(array $data): array {
        $needed = max(1, (int)ceil($data['size_kb'] / BLOCK_SIZE_KB));
        $alloc  = $this->allocate($needed, $data['allocation_type']);
        if (!$alloc['ok']) return $alloc;

        try {
            $this->db->beginTransaction();
            $stmt = $this->db->prepare("INSERT INTO files
                (filename, extension, content, size_kb, allocation_type, allocated_blocks, index_block,
                 parent_id, owner_id, perm_admin, perm_user, perm_guest, is_public)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
            $stmt->execute([
                $data['filename'],
                $data['extension'] ?? null,
                $data['content'] ?? '',
                $data['size_kb'],
                $data['allocation_type'],
                json_encode($alloc['blocks']),
                $alloc['index_block'],
                $data['parent_id'],
                $data['owner_id'],
                $data['perm_admin'] ?? 'rwx',
                $data['perm_user']  ?? 'rw-',
                $data['perm_guest'] ?? 'r--',
                (int)($data['is_public'] ?? 0),
            ]);
            $fileId = (int)$this->db->lastInsertId();

            $upd = $this->db->prepare("UPDATE disk_blocks SET occupied=1, file_id=? WHERE block_index=?");
            foreach ($alloc['blocks'] as $b) $upd->execute([$fileId, $b]);
            if ($alloc['index_block'] !== null) $upd->execute([$fileId, $alloc['index_block']]);

            $this->db->commit();
            return ['ok' => true, 'file_id' => $fileId, 'blocks' => $alloc['blocks'], 'index_block' => $alloc['index_block']];
        } catch (Throwable $e) {
            $this->db->rollBack();
            return ['ok' => false, 'error' => $e->getMessage()];
        }
    }

    public function readFile(int $fileId, string $role): array {
        $f = $this->db->query("SELECT * FROM files WHERE id = $fileId")->fetch();
        if (!$f) return ['ok' => false, 'error' => 'File not found'];
        if (!Permissions::can($role, $f, 'r')) return ['ok' => false, 'error' => 'Permission denied (no read)'];
        return ['ok' => true, 'file' => $f];
    }

    public function filePath(int $fileId): string {
        $f = $this->db->query("SELECT * FROM files WHERE id = $fileId")->fetch();
        if (!$f) return '/';
        return rtrim($this->buildPath((int)$f['parent_id']), '/') . '/' . $f['filename'];
    }

    /* ============================================================
       TRASH / SOFT DELETE
       ============================================================ */

    public function trashFile(int $id): void {
        $this->db->prepare("UPDATE files SET is_trashed = 1, trashed_at = CURRENT_TIMESTAMP,
            original_parent_id = parent_id WHERE id = ?")->execute([$id]);
    }

    public function restoreFile(int $id): bool {
        $f = $this->db->query("SELECT * FROM files WHERE id = $id")->fetch();
        if (!$f) return false;
        $parent = $f['original_parent_id'] ?: 1;
        $exists = $this->db->query("SELECT id FROM directories WHERE id = $parent")->fetch();
        if (!$exists) $parent = 1;
        $this->db->prepare("UPDATE files SET is_trashed = 0, trashed_at = NULL,
            parent_id = ?, original_parent_id = NULL WHERE id = ?")->execute([$parent, $id]);
        return true;
    }

    public function trashDirectory(int $id): void {
        $this->db->prepare("UPDATE directories SET is_trashed = 1, trashed_at = CURRENT_TIMESTAMP WHERE id = ?")->execute([$id]);
        $children = $this->db->query("SELECT id FROM files WHERE parent_id = $id")->fetchAll();
        foreach ($children as $c) $this->trashFile((int)$c['id']);
    }

    public function listTrash(): array {
        $files = $this->db->query("SELECT * FROM files WHERE is_trashed = 1 ORDER BY trashed_at DESC")->fetchAll();
        $dirs  = $this->db->query("SELECT * FROM directories WHERE is_trashed = 1 AND is_root = 0 ORDER BY trashed_at DESC")->fetchAll();
        return ['files' => $files, 'directories' => $dirs];
    }

    /* ============================================================
       SHARING
       ============================================================ */

    public function share(int $id, string $type, string $role, string $perm = 'r--'): void {
        $stmt = $this->db->prepare("INSERT INTO shares(resource_type, resource_id, shared_with_role, permission)
            VALUES (?,?,?,?)");
        $stmt->execute([$type, $id, $role, $perm]);
    }

    public function unshare(int $shareId): void {
        $this->db->prepare("DELETE FROM shares WHERE id = ?")->execute([$shareId]);
    }

  public function listSharedWith(string $role, string $username = ''): array {
        $stmt = $this->db->prepare("SELECT s.*, f.filename, f.size_kb, f.allocation_type, d.name AS dir_name
            FROM shares s
            LEFT JOIN files f ON s.resource_type = 'file' AND f.id = s.resource_id
            LEFT JOIN directories d ON s.resource_type = 'directory' AND d.id = s.resource_id
            ORDER BY s.created_at DESC");
        $stmt->execute();
        return $stmt->fetchAll();
    }

    public function listPublicFiles(): array {
        $files = $this->db->query("SELECT * FROM files WHERE is_public = 1 AND is_trashed = 0 ORDER BY filename")->fetchAll();
        $dirs  = $this->db->query("SELECT * FROM directories WHERE is_public = 1 AND is_trashed = 0 AND is_root = 0 ORDER BY name")->fetchAll();
        return ['files' => $files, 'directories' => $dirs];
    }
}