<?php
// =====================================================================
// ApexMoto POS — Supabase Sync Engine
// Pushes pending local MySQL changes to Supabase cloud
// =====================================================================

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

require_once __DIR__ . '/../config/db.php';
require_once __DIR__ . '/../config/supabase.php';

$action = $_GET['action'] ?? '';

// ─── Table dependency order for full sync (parents first) ─────────────
$TABLE_ORDER = [
    'parts',
    'customers',
    'mechanics',
    'vehicles',
    'service_jobs',
    'service_job_parts',
    'transactions',
    'transaction_items',
    'labor_records',
    'cash_outs',
    'entry_capitals',
];

// ─── Column mappings: special conversions MySQL → Supabase ────────────
// Key = table.column, Value = conversion type
$COLUMN_CONVERSIONS = [
    'parts.alt_barcodes' => 'json_to_array',  // MySQL JSON string → Postgres TEXT[]
];

// ─── Columns to exclude from sync (auto-managed by Supabase) ─────────
$EXCLUDE_COLUMNS = ['created_at', 'updated_at'];

// =====================================================================
// HELPER: Make a cURL request to the Supabase REST API
// =====================================================================
function supabase_request($method, $endpoint, $body = null, $extra_headers = []) {
    global $supabase_rest, $supabase_anon;

    $url = $supabase_rest . $endpoint;

    $headers = [
        'apikey: ' . $supabase_anon,
        'Authorization: Bearer ' . $supabase_anon,
        'Content-Type: application/json',
    ];
    $headers = array_merge($headers, $extra_headers);

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL            => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $headers,
    ]);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    }

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        return ['success' => false, 'error' => 'cURL error: ' . $curlError, 'http_code' => 0];
    }

    $decoded = json_decode($response, true);

    if ($httpCode >= 200 && $httpCode < 300) {
        return ['success' => true, 'data' => $decoded, 'http_code' => $httpCode];
    } else {
        $errMsg = '';
        if (is_array($decoded) && isset($decoded['message'])) {
            $errMsg = $decoded['message'];
        } elseif (is_array($decoded) && isset($decoded['error'])) {
            $errMsg = $decoded['error'];
        } else {
            $errMsg = substr($response, 0, 300);
        }
        return ['success' => false, 'error' => $errMsg, 'http_code' => $httpCode];
    }
}

// =====================================================================
// HELPER: Check if Supabase is reachable
// =====================================================================
function check_supabase_online() {
    $result = supabase_request('GET', '/parts?select=id&limit=1');
    return $result['success'] || $result['http_code'] > 0;
}

// =====================================================================
// HELPER: Convert a MySQL row to Supabase-compatible format
// =====================================================================
function convert_row_for_supabase($table, $row) {
    global $COLUMN_CONVERSIONS, $EXCLUDE_COLUMNS;

    if (!is_array($row)) return $row;

    $converted = [];
    foreach ($row as $col => $val) {
        // Skip auto-managed timestamp columns
        if (in_array($col, $EXCLUDE_COLUMNS)) continue;

        $key = $table . '.' . $col;
        if (isset($COLUMN_CONVERSIONS[$key])) {
            switch ($COLUMN_CONVERSIONS[$key]) {
                case 'json_to_array':
                    // MySQL stores JSON string like '["a","b"]', Supabase expects array
                    if (is_string($val)) {
                        $decoded = json_decode($val, true);
                        $val = is_array($decoded) ? $decoded : [];
                    }
                    break;
            }
        }
        $converted[$col] = $val;
    }
    return $converted;
}

// =====================================================================
// ACTION HANDLERS
// =====================================================================
try {
    switch ($action) {

        // ─── STATUS: Return sync queue stats ─────────────────────────
        case 'status':
            // Count pending items
            $stmt = $pdo->query("SELECT COUNT(*) FROM sync_queue WHERE synced = FALSE");
            $pending = (int)$stmt->fetchColumn();

            // Count failed items (retried 3+ times)
            $stmt = $pdo->query("SELECT COUNT(*) FROM sync_queue WHERE synced = FALSE AND retries >= 3");
            $failed = (int)$stmt->fetchColumn();

            // Last sync time
            $stmt = $pdo->prepare("SELECT value FROM sync_meta WHERE key_name = 'last_sync_time'");
            $stmt->execute();
            $lastSync = $stmt->fetchColumn() ?: null;

            // Check if sync is enabled
            $stmt = $pdo->prepare("SELECT value FROM sync_meta WHERE key_name = 'sync_enabled'");
            $stmt->execute();
            $enabled = $stmt->fetchColumn();
            $enabled = ($enabled !== 'false');

            // Quick online check (lightweight)
            $online = check_supabase_online();

            echo json_encode([
                'pending'   => $pending,
                'failed'    => $failed,
                'lastSync'  => $lastSync,
                'online'    => $online,
                'enabled'   => $enabled,
            ]);
            break;

        // ─── RUN: Process pending sync items ─────────────────────────
        case 'run':
            if (!check_supabase_online()) {
                echo json_encode([
                    'success' => false,
                    'message' => 'Supabase is not reachable. Changes are queued for later.',
                    'synced'  => 0,
                    'errors'  => 0,
                ]);
                break;
            }

            // Fetch pending items ordered by creation time (max 50 per batch)
            $stmt = $pdo->query("
                SELECT * FROM sync_queue 
                WHERE synced = FALSE AND retries < 5
                ORDER BY created_at ASC 
                LIMIT 50
            ");
            $items = $stmt->fetchAll();

            $synced = 0;
            $errors = 0;
            $errorMessages = [];

            foreach ($items as $item) {
                $table  = $item['table_name'];
                $id     = $item['record_id'];
                $act    = $item['action'];
                $payload = $item['payload'] ? json_decode($item['payload'], true) : null;

                $result = null;

                if ($act === 'upsert' && $payload) {
                    $converted = convert_row_for_supabase($table, $payload);
                    $result = supabase_request(
                        'POST',
                        '/' . $table,
                        $converted,
                        ['Prefer: resolution=merge-duplicates']
                    );
                } elseif ($act === 'delete') {
                    $result = supabase_request(
                        'DELETE',
                        '/' . $table . '?id=eq.' . urlencode($id)
                    );
                } elseif ($act === 'delete_all') {
                    // Delete all records from a table using neq trick
                    $result = supabase_request(
                        'DELETE',
                        '/' . $table . '?id=neq.00000000-0000-0000-0000-000000000000'
                    );
                }

                if ($result && $result['success']) {
                    // Mark as synced
                    $upd = $pdo->prepare("UPDATE sync_queue SET synced = TRUE, synced_at = NOW(), error_msg = NULL WHERE id = ?");
                    $upd->execute([$item['id']]);
                    $synced++;
                } else {
                    // Increment retries and log error
                    $errMsg = $result ? substr($result['error'], 0, 500) : 'Unknown error';
                    $upd = $pdo->prepare("UPDATE sync_queue SET retries = retries + 1, error_msg = ? WHERE id = ?");
                    $upd->execute([$errMsg, $item['id']]);
                    $errors++;
                    $errorMessages[] = "[{$table}/{$id}] {$errMsg}";
                }
            }

            // Update last sync time
            $pdo->prepare("
                INSERT INTO sync_meta (key_name, value) VALUES ('last_sync_time', NOW())
                ON DUPLICATE KEY UPDATE value = NOW()
            ")->execute();

            // Clean up old synced items (keep last 7 days)
            $pdo->exec("DELETE FROM sync_queue WHERE synced = TRUE AND synced_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");

            echo json_encode([
                'success' => true,
                'synced'  => $synced,
                'errors'  => $errors,
                'errorMessages' => array_slice($errorMessages, 0, 5),
                'remaining' => max(0, count($items) - $synced),
            ]);
            break;

        // ─── FULL_SYNC: Push ALL data from MySQL to Supabase ─────────
        case 'full_sync':
            if (!check_supabase_online()) {
                echo json_encode([
                    'success' => false,
                    'message' => 'Supabase is not reachable.',
                ]);
                break;
            }

            $results = [];
            $totalSynced = 0;
            $totalErrors = 0;

            foreach ($TABLE_ORDER as $table) {
                $stmt = $pdo->query("SELECT * FROM `{$table}`");
                $rows = $stmt->fetchAll();

                if (empty($rows)) {
                    $results[$table] = ['count' => 0, 'status' => 'empty'];
                    continue;
                }

                // Convert all rows
                $converted = array_map(function($row) use ($table) {
                    return convert_row_for_supabase($table, $row);
                }, $rows);

                // Batch upsert (chunks of 100)
                $chunks = array_chunk($converted, 100);
                $tableErrors = 0;
                $tableSynced = 0;

                foreach ($chunks as $chunk) {
                    $result = supabase_request(
                        'POST',
                        '/' . $table,
                        $chunk,
                        ['Prefer: resolution=merge-duplicates']
                    );
                    if ($result['success']) {
                        $tableSynced += count($chunk);
                    } else {
                        $tableErrors += count($chunk);
                        // Try individual inserts as fallback
                        foreach ($chunk as $singleRow) {
                            $singleResult = supabase_request(
                                'POST',
                                '/' . $table,
                                $singleRow,
                                ['Prefer: resolution=merge-duplicates']
                            );
                            if ($singleResult['success']) {
                                $tableSynced++;
                                $tableErrors--;
                            }
                        }
                    }
                }

                $totalSynced += $tableSynced;
                $totalErrors += $tableErrors;
                $results[$table] = [
                    'count'  => count($rows),
                    'synced' => $tableSynced,
                    'errors' => $tableErrors,
                    'status' => $tableErrors === 0 ? 'ok' : 'partial',
                ];
            }

            // Mark all pending sync_queue items as synced
            $pdo->exec("UPDATE sync_queue SET synced = TRUE, synced_at = NOW() WHERE synced = FALSE");

            // Update last full sync time
            $pdo->prepare("
                INSERT INTO sync_meta (key_name, value) VALUES ('last_full_sync', NOW())
                ON DUPLICATE KEY UPDATE value = NOW()
            ")->execute();
            $pdo->prepare("
                INSERT INTO sync_meta (key_name, value) VALUES ('last_sync_time', NOW())
                ON DUPLICATE KEY UPDATE value = NOW()
            ")->execute();

            echo json_encode([
                'success'     => true,
                'totalSynced' => $totalSynced,
                'totalErrors' => $totalErrors,
                'tables'      => $results,
            ]);
            break;

        // ─── TOGGLE: Enable/disable sync ─────────────────────────────
        case 'toggle':
            $input = json_decode(file_get_contents('php://input'), true) ?? [];
            $enabled = !empty($input['enabled']) ? 'true' : 'false';
            $pdo->prepare("
                INSERT INTO sync_meta (key_name, value) VALUES ('sync_enabled', ?)
                ON DUPLICATE KEY UPDATE value = ?
            ")->execute([$enabled, $enabled]);
            echo json_encode(['success' => true, 'enabled' => $enabled === 'true']);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => true, 'message' => "Invalid sync action: '{$action}'"]);
            break;
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => true, 'message' => $e->getMessage()]);
}
