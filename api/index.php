<?php
// =====================================================================
// ApexMoto POS — PHP Backend REST API
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

// Helper function to generate UUID v4
function generate_uuid() {
    return sprintf(
        '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
        mt_rand(0, 0xffff), mt_rand(0, 0xffff),
        mt_rand(0, 0xffff),
        mt_rand(0, 0x0fff) | 0x4000,
        mt_rand(0, 0x3fff) | 0x8000,
        mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
    );
}

// ─── Cloud Sync Queue Helper ─────────────────────────────────────────
// Logs a write operation to the sync_queue table so the sync engine
// can push it to Supabase when internet is available.
function queue_sync($pdo, $table, $record_id, $action, $payload = null) {
    try {
        $stmt = $pdo->prepare("
            INSERT INTO sync_queue (table_name, record_id, action, payload)
            VALUES (?, ?, ?, ?)
        ");
        $stmt->execute([
            $table,
            (string)$record_id,
            $action,
            $payload !== null ? json_encode($payload) : null,
        ]);
    } catch (Exception $e) {
        // Sync queue is non-critical — log but don't fail the request
        error_log('[SyncQueue] Failed to queue sync: ' . $e->getMessage());
    }
}

// Get JSON input body
$input = json_decode(file_get_contents('php://input'), true) ?? [];
$action = $_GET['action'] ?? $input['action'] ?? '';

try {
    switch ($action) {

        // ─── PARTS ───────────────────────────────────────────────────

        case 'getParts':
            $stmt = $pdo->query("SELECT * FROM parts ORDER BY category ASC, name ASC");
            $rows = $stmt->fetchAll();
            $parts = array_map(function($p) {
                $alt = json_decode($p['alt_barcodes'] ?? '[]', true);
                return [
                    'id'          => $p['id'],
                    'sku'         => $p['sku'],
                    'name'        => $p['name'],
                    'category'    => $p['category'],
                    'cost'        => (float)$p['cost'],
                    'price'       => (float)$p['price'],
                    'stock'       => (int)$p['stock'],
                    'minStock'    => (int)$p['min_stock'],
                    'altBarcodes' => is_array($alt) ? $alt : [],
                ];
            }, $rows);
            echo json_encode(['data' => $parts]);
            break;

        case 'upsertPart':
            $part = $input['part'] ?? [];
            $id = (!empty($part['id']) && !str_starts_with($part['id'], 'p')) ? $part['id'] : generate_uuid();
            $altJson = json_encode($part['altBarcodes'] ?? []);

            $stmt = $pdo->prepare("
                INSERT INTO parts (id, sku, name, category, cost, price, stock, min_stock, alt_barcodes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    sku = VALUES(sku),
                    name = VALUES(name),
                    category = VALUES(category),
                    cost = VALUES(cost),
                    price = VALUES(price),
                    stock = VALUES(stock),
                    min_stock = VALUES(min_stock),
                    alt_barcodes = VALUES(alt_barcodes)
            ");
            $stmt->execute([
                $id,
                $part['sku'],
                $part['name'],
                $part['category'],
                (float)$part['cost'],
                (float)$part['price'],
                (int)$part['stock'],
                (int)($part['minStock'] ?? 2),
                $altJson
            ]);
            $part['id'] = $id;
            // Queue for cloud sync
            queue_sync($pdo, 'parts', $id, 'upsert', array_merge($part, ['id' => $id]));
            echo json_encode(['data' => $part]);
            break;

        case 'updatePartStock':
            $partId = $input['partId'] ?? '';
            $newStock = (int)($input['newStock'] ?? 0);
            $stmt = $pdo->prepare("UPDATE parts SET stock = ? WHERE id = ?");
            $stmt->execute([$newStock, $partId]);
            // Queue stock update for cloud sync
            $sRow = $pdo->prepare("SELECT * FROM parts WHERE id = ?");
            $sRow->execute([$partId]);
            $partRow = $sRow->fetch();
            if ($partRow) queue_sync($pdo, 'parts', $partId, 'upsert', $partRow);
            echo json_encode(['success' => true]);
            break;

        case 'deletePart':
            $partId = $input['partId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM parts WHERE id = ?");
            $stmt->execute([$partId]);
            queue_sync($pdo, 'parts', $partId, 'delete');
            echo json_encode(['success' => true]);
            break;

        // ─── CUSTOMERS ───────────────────────────────────────────────

        case 'getCustomers':
            $cStmt = $pdo->query("SELECT * FROM customers ORDER BY name ASC");
            $customers = $cStmt->fetchAll();

            $vStmt = $pdo->query("SELECT * FROM vehicles");
            $vehicles = $vStmt->fetchAll();

            $result = array_map(function($c) use ($vehicles) {
                $cVehicles = array_values(array_filter($vehicles, function($v) use ($c) {
                    return $v['customer_id'] === $c['id'];
                }));
                return [
                    'id'       => $c['id'],
                    'name'     => $c['name'],
                    'phone'    => $c['phone'],
                    'email'    => $c['email'] ?? '',
                    'debt'     => (float)($c['outstanding_debt'] ?? 0),
                    'vehicles' => array_map(function($v) {
                        return [
                            'id'    => $v['id'],
                            'year'  => $v['year'] ?? '',
                            'make'  => $v['make'],
                            'model' => $v['model'],
                            'plate' => $v['plate'] ?? '',
                            'vin'   => $v['vin'] ?? '',
                        ];
                    }, $cVehicles)
                ];
            }, $customers);

            echo json_encode(['data' => $result]);
            break;

        case 'upsertCustomer':
            $cust = $input['customer'] ?? [];
            $id = (!empty($cust['id']) && strlen($cust['id']) > 10) ? $cust['id'] : generate_uuid();
            $debt = (float)($cust['debt'] ?? 0);

            $stmt = $pdo->prepare("
                INSERT INTO customers (id, name, phone, email, outstanding_debt)
                VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    phone = VALUES(phone),
                    email = VALUES(email),
                    outstanding_debt = VALUES(outstanding_debt)
            ");
            $stmt->execute([
                $id,
                $cust['name'],
                $cust['phone'],
                $cust['email'] ?? null,
                $debt
            ]);
            // Queue customer for cloud sync
            queue_sync($pdo, 'customers', $id, 'upsert', [
                'id' => $id, 'name' => $cust['name'], 'phone' => $cust['phone'],
                'email' => $cust['email'] ?? null,
                'outstanding_debt' => $debt,
            ]);
            echo json_encode(['data' => ['id' => $id]]);
            break;

        case 'deleteCustomer':
            $customerId = $input['customerId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM customers WHERE id = ?");
            $stmt->execute([$customerId]);
            queue_sync($pdo, 'customers', $customerId, 'delete');
            echo json_encode(['success' => true]);
            break;

        case 'clearCustomerDebt':
            $customerId = $input['customerId'] ?? '';
            $stmt = $pdo->prepare("UPDATE customers SET outstanding_debt = 0 WHERE id = ?");
            $stmt->execute([$customerId]);
            $row = $pdo->prepare("SELECT * FROM customers WHERE id = ?");
            $row->execute([$customerId]);
            $custRow = $row->fetch();
            if ($custRow) queue_sync($pdo, 'customers', $customerId, 'upsert', $custRow);
            echo json_encode(['success' => true]);
            break;

        // ─── VEHICLES ────────────────────────────────────────────────

        case 'addVehicle':
            $customerId = $input['customerId'] ?? '';
            $veh = $input['vehicle'] ?? [];
            $id = generate_uuid();

            $stmt = $pdo->prepare("
                INSERT INTO vehicles (id, customer_id, year, make, model, plate, vin)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $id,
                $customerId,
                $veh['year'] ?? null,
                $veh['make'],
                $veh['model'],
                $veh['plate'] ?? null,
                $veh['vin'] ?? null
            ]);
            queue_sync($pdo, 'vehicles', $id, 'upsert', [
                'id' => $id, 'customer_id' => $customerId,
                'year' => $veh['year'] ?? null, 'make' => $veh['make'],
                'model' => $veh['model'], 'plate' => $veh['plate'] ?? null,
                'vin' => $veh['vin'] ?? null,
            ]);
            echo json_encode(['data' => ['id' => $id]]);
            break;

        case 'deleteVehicle':
            $vehicleId = $input['vehicleId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM vehicles WHERE id = ?");
            $stmt->execute([$vehicleId]);
            queue_sync($pdo, 'vehicles', $vehicleId, 'delete');
            echo json_encode(['success' => true]);
            break;

        // ─── SERVICE JOBS ────────────────────────────────────────────

        case 'getServiceJobs':
            $jStmt = $pdo->query("SELECT * FROM service_jobs ORDER BY created_at DESC");
            $jobs = $jStmt->fetchAll();

            $pStmt = $pdo->query("SELECT * FROM service_job_parts");
            $jobParts = $pStmt->fetchAll();

            $result = array_map(function($j) use ($jobParts) {
                $myParts = array_values(array_filter($jobParts, function($p) use ($j) {
                    return $p['job_id'] === $j['id'];
                }));
                return [
                    'id'           => $j['id'],
                    'customerId'   => $j['customer_id'],
                    'customerName' => $j['customer_name'],
                    'vehicle'      => $j['vehicle'],
                    'description'  => $j['description'],
                    'mechanic'     => $j['mechanic'],
                    'status'       => $j['status'],
                    'laborCost'    => (float)$j['labor_cost'],
                    'parts'        => array_map(function($p) {
                        return [
                            '_rowId'   => $p['id'],
                            'partId'   => $p['part_id'],
                            'name'     => $p['name'],
                            'quantity' => (int)$p['quantity'],
                            'price'    => (float)$p['price'],
                        ];
                    }, $myParts),
                    'dateCreated' => $j['created_at'],
                    'dateUpdated' => $j['updated_at'],
                ];
            }, $jobs);

            echo json_encode(['data' => $result]);
            break;

        case 'createServiceJob':
            $job = $input['job'] ?? [];
            $stmt = $pdo->prepare("
                INSERT INTO service_jobs (id, customer_id, customer_name, vehicle, description, mechanic, status, labor_cost)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $job['id'],
                !empty($job['customerId']) ? $job['customerId'] : null,
                $job['customerName'],
                $job['vehicle'],
                $job['description'],
                $job['mechanic'],
                $job['status'] ?? 'Draft',
                (float)($job['laborCost'] ?? 0)
            ]);
            queue_sync($pdo, 'service_jobs', $job['id'], 'upsert', [
                'id' => $job['id'],
                'customer_id' => !empty($job['customerId']) ? $job['customerId'] : null,
                'customer_name' => $job['customerName'],
                'vehicle' => $job['vehicle'],
                'description' => $job['description'],
                'mechanic' => $job['mechanic'],
                'status' => $job['status'] ?? 'Draft',
                'labor_cost' => (float)($job['laborCost'] ?? 0),
            ]);
            echo json_encode(['success' => true]);
            break;

        case 'updateServiceJob':
            $job = $input['job'] ?? [];
            $stmt = $pdo->prepare("
                UPDATE service_jobs
                SET status = ?, mechanic = ?, description = ?, labor_cost = ?, updated_at = NOW()
                WHERE id = ?
            ");
            $stmt->execute([
                $job['status'],
                $job['mechanic'],
                $job['description'],
                (float)($job['laborCost'] ?? 0),
                $job['id']
            ]);
            $row = $pdo->prepare("SELECT * FROM service_jobs WHERE id = ?");
            $row->execute([$job['id']]);
            $jobRow = $row->fetch();
            if ($jobRow) queue_sync($pdo, 'service_jobs', $job['id'], 'upsert', $jobRow);
            echo json_encode(['success' => true]);
            break;

        case 'deleteServiceJob':
            $jobId = $input['jobId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM service_jobs WHERE id = ?");
            $stmt->execute([$jobId]);
            queue_sync($pdo, 'service_jobs', $jobId, 'delete');
            echo json_encode(['success' => true]);
            break;

        case 'addPartToJob':
            $jobId  = $input['jobId'] ?? '';
            $partId = $input['partId'] ?? null;
            $name   = $input['name'] ?? '';
            $price  = (float)($input['price'] ?? 0);

            // Check if part already exists in job
            $stmt = $pdo->prepare("SELECT id, quantity FROM service_job_parts WHERE job_id = ? AND part_id = ?");
            $stmt->execute([$jobId, $partId]);
            $existing = $stmt->fetch();

            if ($existing) {
                $uStmt = $pdo->prepare("UPDATE service_job_parts SET quantity = quantity + 1 WHERE id = ?");
                $uStmt->execute([$existing['id']]);
            } else {
                $iStmt = $pdo->prepare("
                    INSERT INTO service_job_parts (id, job_id, part_id, name, price, quantity)
                    VALUES (?, ?, ?, ?, ?, 1)
                ");
                $iStmt->execute([generate_uuid(), $jobId, $partId, $name, $price]);
            }
            echo json_encode(['success' => true]);
            break;

        case 'insertServiceJobParts':
            $partsArray = $input['partsArray'] ?? [];
            if (!empty($partsArray)) {
                $stmt = $pdo->prepare("
                    INSERT INTO service_job_parts (id, job_id, part_id, name, price, quantity)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                foreach ($partsArray as $p) {
                    $stmt->execute([
                        generate_uuid(),
                        $p['job_id'],
                        $p['part_id'] ?? null,
                        $p['name'],
                        (float)$p['price'],
                        (int)($p['quantity'] ?? 1)
                    ]);
                }
            }
            echo json_encode(['success' => true]);
            break;

        case 'updateJobPartQty':
            $rowId  = $input['rowId'] ?? '';
            $newQty = (int)($input['newQty'] ?? 1);
            $stmt = $pdo->prepare("UPDATE service_job_parts SET quantity = ? WHERE id = ?");
            $stmt->execute([$newQty, $rowId]);
            echo json_encode(['success' => true]);
            break;

        case 'removeJobPart':
            $rowId = $input['rowId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM service_job_parts WHERE id = ?");
            $stmt->execute([$rowId]);
            echo json_encode(['success' => true]);
            break;

        // ─── TRANSACTIONS ────────────────────────────────────────────

        case 'getTransactions':
            $tStmt = $pdo->query("SELECT * FROM transactions ORDER BY date DESC");
            $txs = $tStmt->fetchAll();

            $iStmt = $pdo->query("SELECT * FROM transaction_items");
            $items = $iStmt->fetchAll();

            $result = array_map(function($t) use ($items) {
                $myItems = array_values(array_filter($items, function($i) use ($t) {
                    return $i['transaction_id'] === $t['id'];
                }));
                return [
                    'id'            => $t['id'],
                    'type'          => $t['type'],
                    'customerId'    => $t['customer_id'],
                    'customerName'  => $t['customer_name'],
                    'vehicle'       => $t['vehicle'] ?? null,
                    'subtotal'      => (float)$t['subtotal'],
                    'tax'           => (float)$t['tax'],
                    'discount'      => (float)$t['discount'],
                    'total'         => (float)$t['total'],
                    'paymentMethod' => $t['payment_method'],
                    'date'          => $t['date'],
                    'items'         => array_map(function($i) {
                        return [
                            'id'       => $i['part_id'] ?? 'labor',
                            'name'     => $i['name'],
                            'quantity' => (int)$i['quantity'],
                            'price'    => (float)$i['price'],
                        ];
                    }, $myItems)
                ];
            }, $txs);

            echo json_encode(['data' => $result]);
            break;

        case 'createTransaction':
            $tx = $input['tx'] ?? [];
            $txId = $tx['id'] ?? null;

            if (empty($txId)) {
                $txId = 'TX-' . round(microtime(true) * 1000) . '-' . mt_rand(100, 999);
            }

            // Check if transaction ID already exists in DB to prevent 1062 duplicate key errors
            $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE id = ?");
            $checkStmt->execute([$txId]);
            if ($checkStmt->fetchColumn() > 0) {
                // Generate a guaranteed unique timestamp-based ID
                while (true) {
                    $txId = 'TX-' . round(microtime(true) * 1000) . '-' . mt_rand(100, 999);
                    $checkStmt->execute([$txId]);
                    if ($checkStmt->fetchColumn() == 0) {
                        break;
                    }
                    usleep(1000); // Wait 1ms
                }
            }

            $pdo->beginTransaction();

            $stmt = $pdo->prepare("
                INSERT INTO transactions (id, type, customer_id, customer_name, vehicle, subtotal, tax, discount, total, payment_method, date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $txId,
                $tx['type'] ?? 'Retail',
                !empty($tx['customerId']) ? $tx['customerId'] : null,
                $tx['customerName'] ?? 'Walk-in Customer',
                $tx['vehicle'] ?? null,
                (float)($tx['subtotal'] ?? 0),
                (float)($tx['tax'] ?? 0),
                (float)($tx['discount'] ?? 0),
                (float)($tx['total'] ?? 0),
                $tx['paymentMethod'] ?? 'Cash',
                $tx['date'] ?? date('Y-m-d H:i:s')
            ]);

            if (!empty($tx['items'])) {
                $iStmt = $pdo->prepare("
                    INSERT INTO transaction_items (id, transaction_id, part_id, name, quantity, price)
                    VALUES (?, ?, ?, ?, ?, ?)
                ");
                foreach ($tx['items'] as $item) {
                    $partId = ($item['id'] !== 'labor') ? $item['id'] : null;
                    $iStmt->execute([
                        generate_uuid(),
                        $txId,
                        $partId,
                        $item['name'],
                        (int)$item['quantity'],
                        (float)$item['price']
                    ]);
                }
            }

            $pdo->commit();
            // Queue transaction for cloud sync
            $txRow = $pdo->prepare("SELECT * FROM transactions WHERE id = ?");
            $txRow->execute([$txId]);
            $txData = $txRow->fetch();
            if ($txData) queue_sync($pdo, 'transactions', $txId, 'upsert', $txData);
            // Queue transaction items
            if (!empty($tx['items'])) {
                $iRows = $pdo->prepare("SELECT * FROM transaction_items WHERE transaction_id = ?");
                $iRows->execute([$txId]);
                foreach ($iRows->fetchAll() as $iRow) {
                    queue_sync($pdo, 'transaction_items', $iRow['id'], 'upsert', $iRow);
                }
            }
            echo json_encode(['success' => true, 'id' => $txId]);
            break;

        case 'updateTransactionPaymentMethod':
            $txId = $input['transactionId'] ?? '';
            $newMethod = $input['newMethod'] ?? 'Cash';
            $stmt = $pdo->prepare("UPDATE transactions SET payment_method = ? WHERE id = ?");
            $stmt->execute([$newMethod, $txId]);
            $row = $pdo->prepare("SELECT * FROM transactions WHERE id = ?");
            $row->execute([$txId]);
            $txRow = $row->fetch();
            if ($txRow) queue_sync($pdo, 'transactions', $txId, 'upsert', $txRow);
            echo json_encode(['success' => true]);
            break;

        // ─── MECHANICS & LABOR ───────────────────────────────────────

        case 'getMechanics':
            $mStmt = $pdo->query("SELECT * FROM mechanics ORDER BY name ASC");
            $mechanics = $mStmt->fetchAll();

            $lStmt = $pdo->query("SELECT * FROM labor_records ORDER BY date DESC");
            $laborRecords = $lStmt->fetchAll();

            $result = array_map(function($m) use ($laborRecords) {
                $myRecords = array_values(array_filter($laborRecords, function($r) use ($m) {
                    return $r['mechanic_id'] === $m['id'];
                }));
                return [
                    'id'   => $m['id'],
                    'name' => $m['name'],
                    'role' => $m['role'] ?? '',
                    'laborRecords' => array_map(function($r) {
                        return [
                            'id'          => $r['id'],
                            'description' => $r['description'],
                            'amount'      => (float)$r['amount'],
                            'date'        => $r['date']
                        ];
                    }, $myRecords)
                ];
            }, $mechanics);

            echo json_encode(['data' => $result]);
            break;

        case 'upsertMechanic':
            $mech = $input['mechanic'] ?? [];
            $id = (!empty($mech['id']) && strlen($mech['id']) > 10) ? $mech['id'] : generate_uuid();

            $stmt = $pdo->prepare("
                INSERT INTO mechanics (id, name, role)
                VALUES (?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    name = VALUES(name),
                    role = VALUES(role)
            ");
            $stmt->execute([
                $id,
                $mech['name'],
                $mech['role'] ?? null
            ]);
            queue_sync($pdo, 'mechanics', $id, 'upsert', [
                'id' => $id, 'name' => $mech['name'], 'role' => $mech['role'] ?? null,
            ]);
            echo json_encode(['data' => ['id' => $id]]);
            break;

        case 'deleteMechanic':
            $mechanicId = $input['mechanicId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM mechanics WHERE id = ?");
            $stmt->execute([$mechanicId]);
            queue_sync($pdo, 'mechanics', $mechanicId, 'delete');
            echo json_encode(['success' => true]);
            break;

        case 'addLaborRecord':
            $mechanicId = $input['mechanicId'] ?? '';
            $record = $input['record'] ?? [];
            $id = generate_uuid();

            $stmt = $pdo->prepare("
                INSERT INTO labor_records (id, mechanic_id, description, amount, date)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $id,
                $mechanicId,
                $record['description'],
                (float)$record['amount'],
                $record['date'] ?? date('Y-m-d')
            ]);
            queue_sync($pdo, 'labor_records', $id, 'upsert', [
                'id' => $id, 'mechanic_id' => $mechanicId,
                'description' => $record['description'],
                'amount' => (float)$record['amount'],
                'date' => $record['date'] ?? date('Y-m-d'),
            ]);
            echo json_encode(['data' => ['id' => $id]]);
            break;

        case 'deleteLaborRecord':
            $recordId = $input['recordId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM labor_records WHERE id = ?");
            $stmt->execute([$recordId]);
            queue_sync($pdo, 'labor_records', $recordId, 'delete');
            echo json_encode(['success' => true]);
            break;

        // ─── CASH OUTS & ENTRY CAPITALS ───────────────────────────────

        case 'getCashOuts':
            $stmt = $pdo->query("SELECT * FROM cash_outs ORDER BY date DESC");
            $rows = $stmt->fetchAll();
            $result = array_map(function($r) {
                return [
                    'id'     => $r['id'],
                    'amount' => (float)$r['amount'],
                    'reason' => $r['reason'],
                    'notes'  => $r['notes'] ?? '',
                    'date'   => $r['date'],
                ];
            }, $rows);
            echo json_encode(['data' => $result]);
            break;

        case 'createCashOut':
            $entry = $input['entry'] ?? [];
            $id = generate_uuid();
            $stmt = $pdo->prepare("
                INSERT INTO cash_outs (id, amount, reason, notes, date)
                VALUES (?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $id,
                (float)$entry['amount'],
                $entry['reason'],
                $entry['notes'] ?? '',
                $entry['date'] ?? date('Y-m-d H:i:s')
            ]);
            queue_sync($pdo, 'cash_outs', $id, 'upsert', [
                'id' => $id, 'amount' => (float)$entry['amount'],
                'reason' => $entry['reason'], 'notes' => $entry['notes'] ?? '',
                'date' => $entry['date'] ?? date('Y-m-d H:i:s'),
            ]);
            echo json_encode(['data' => ['id' => $id]]);
            break;

        case 'getEntryCapitals':
            $stmt = $pdo->query("SELECT * FROM entry_capitals ORDER BY date DESC");
            $rows = $stmt->fetchAll();
            $result = array_map(function($r) {
                return [
                    'id'     => $r['id'],
                    'amount' => (float)$r['amount'],
                    'date'   => $r['date'],
                ];
            }, $rows);
            echo json_encode(['data' => $result]);
            break;

        case 'createEntryCapital':
            $entry = $input['entry'] ?? [];
            $id = generate_uuid();
            $stmt = $pdo->prepare("
                INSERT INTO entry_capitals (id, amount, date)
                VALUES (?, ?, ?)
            ");
            $stmt->execute([
                $id,
                (float)$entry['amount'],
                $entry['date'] ?? date('Y-m-d H:i:s')
            ]);
            queue_sync($pdo, 'entry_capitals', $id, 'upsert', [
                'id' => $id, 'amount' => (float)$entry['amount'],
                'date' => $entry['date'] ?? date('Y-m-d H:i:s'),
            ]);
            echo json_encode(['data' => ['id' => $id]]);
            break;

        case 'deleteAllSalesData':
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");
            $pdo->exec("DELETE FROM transaction_items;");
            $pdo->exec("DELETE FROM transactions;");
            $pdo->exec("DELETE FROM cash_outs;");
            $pdo->exec("DELETE FROM entry_capitals;");
            $pdo->exec("DELETE FROM labor_records;");
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");
            // Queue cloud deletions for all sales tables
            foreach (['transaction_items','transactions','cash_outs','entry_capitals','labor_records'] as $tbl) {
                queue_sync($pdo, $tbl, 'ALL', 'delete_all');
            }
            echo json_encode(['success' => true]);
            break;

        case 'getSettings':
            $settingsPath = __DIR__ . '/../config/settings.json';
            if (file_exists($settingsPath)) {
                $settings = json_decode(file_get_contents($settingsPath), true);
            } else {
                $settings = [
                    'cashierRestrictedViews' => ['dashboard', 'mechanics', 'reports']
                ];
            }
            echo json_encode(['data' => $settings]);
            break;

        case 'updateSettings':
            $settingsPath = __DIR__ . '/../config/settings.json';
            $settings = $input['settings'] ?? [];
            file_put_contents($settingsPath, json_encode($settings, JSON_PRETTY_PRINT));
            echo json_encode(['success' => true]);
            break;

        default:
            http_response_code(400);
            echo json_encode(['error' => true, 'message' => "Invalid or missing action: '{$action}'"]);
            break;
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => true, 'message' => $e->getMessage()]);
}
