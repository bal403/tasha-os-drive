<?php
// lib/Permissions.php
require_once __DIR__ . '/Database.php';

class Permissions {
    /**
     * Check kung ang role ay may permission (r/w/x) sa file.
     * Priority:
     *   1. Public files → laging pwedeng i-read ng lahat
     *   2. Explicit share (shares table) → kung may match, granted
     *   3. Fallback: perm_admin / perm_user / perm_guest column
     */
    public static function can(string $role, array $file, string $action): bool {
        // Public files — everyone can read
        if (!empty($file['is_public']) && $action === 'r') return true;

        // Explicit share grants the action
        try {
            $stmt = Database::get()->prepare("SELECT permission FROM shares
                WHERE resource_type='file' AND resource_id=? AND (shared_with_role=? OR shared_with_role='public')");
            $stmt->execute([(int)$file['id'], $role]);
            foreach ($stmt->fetchAll() as $s) {
                if (str_contains($s['permission'], $action)) return true;
            }
        } catch (Throwable $e) { /* shares table may not exist yet — ignore */ }

        $column = match($role) {
            'admin' => 'perm_admin',
            'user'  => 'perm_user',
            'guest' => 'perm_guest',
            default => 'perm_guest',
        };
        return str_contains($file[$column] ?? '', $action);
    }
}