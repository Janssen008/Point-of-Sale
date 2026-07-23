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
            echo json_encode(['data' => $part]);
            break;

        case 'updatePartStock':
            $partId = $input['partId'] ?? '';
            $newStock = (int)($input['newStock'] ?? 0);
            $stmt = $pdo->prepare("UPDATE parts SET stock = ? WHERE id = ?");
            $stmt->execute([$newStock, $partId]);
            echo json_encode(['success' => true]);
            break;

        case 'deletePart':
            $partId = $input['partId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM parts WHERE id = ?");
            $stmt->execute([$partId]);
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
            echo json_encode(['data' => ['id' => $id]]);
            break;

        case 'deleteCustomer':
            $customerId = $input['customerId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM customers WHERE id = ?");
            $stmt->execute([$customerId]);
            echo json_encode(['success' => true]);
            break;

        case 'clearCustomerDebt':
            $customerId = $input['customerId'] ?? '';
            $stmt = $pdo->prepare("UPDATE customers SET outstanding_debt = 0 WHERE id = ?");
            $stmt->execute([$customerId]);
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
            echo json_encode(['data' => ['id' => $id]]);
            break;

        case 'deleteVehicle':
            $vehicleId = $input['vehicleId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM vehicles WHERE id = ?");
            $stmt->execute([$vehicleId]);
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
            echo json_encode(['success' => true]);
            break;

        case 'deleteServiceJob':
            $jobId = $input['jobId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM service_jobs WHERE id = ?");
            $stmt->execute([$jobId]);
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
            $pdo->beginTransaction();

            $stmt = $pdo->prepare("
                INSERT INTO transactions (id, type, customer_id, customer_name, vehicle, subtotal, tax, discount, total, payment_method, date)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $tx['id'],
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
                        $tx['id'],
                        $partId,
                        $item['name'],
                        (int)$item['quantity'],
                        (float)$item['price']
                    ]);
                }
            }

            $pdo->commit();
            echo json_encode(['success' => true]);
            break;

        case 'updateTransactionPaymentMethod':
            $txId = $input['transactionId'] ?? '';
            $newMethod = $input['newMethod'] ?? 'Cash';
            $stmt = $pdo->prepare("UPDATE transactions SET payment_method = ? WHERE id = ?");
            $stmt->execute([$newMethod, $txId]);
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
            echo json_encode(['data' => ['id' => $id]]);
            break;

        case 'deleteMechanic':
            $mechanicId = $input['mechanicId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM mechanics WHERE id = ?");
            $stmt->execute([$mechanicId]);
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
            echo json_encode(['data' => ['id' => $id]]);
            break;

        case 'deleteLaborRecord':
            $recordId = $input['recordId'] ?? '';
            $stmt = $pdo->prepare("DELETE FROM labor_records WHERE id = ?");
            $stmt->execute([$recordId]);
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
            echo json_encode(['data' => ['id' => $id]]);
            break;

        case 'deleteAllSalesData':
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 0;");
            $pdo->exec("DELETE FROM transaction_items;");
            $pdo->exec("DELETE FROM transactions;");
            $pdo->exec("DELETE FROM cash_outs;");
            $pdo->exec("DELETE FROM entry_capitals;");
            $pdo->exec("SET FOREIGN_KEY_CHECKS = 1;");
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
