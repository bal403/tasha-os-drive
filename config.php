<?php
// config.php
define('DB_PATH', __DIR__ . '/data/filesystem.sqlite');
define('TOTAL_BLOCKS', 64);       // total virtual disk blocks
define('BLOCK_SIZE_KB', 4);       // each block = 4 KB

// ensure data directory exists
if (!is_dir(__DIR__ . '/data')) {
    mkdir(__DIR__ . '/data', 0777, true);
}