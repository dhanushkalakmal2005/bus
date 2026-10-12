<?php
/* ============================================================
   config.php — Shared configuration bridge
   Reuses db/db.php to connect to the unified database.
   Does NOT create databases or tables on runtime.
   ============================================================ */

require_once __DIR__ . '/db/db.php';

$host = DB_HOST;
$user = DB_USER;
$password = DB_PASS;
$dbname = DB_NAME;

$conn = getConnection();
