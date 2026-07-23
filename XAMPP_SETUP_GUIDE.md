# XAMPP & PHP / MySQL Setup Guide — ApexMoto POS

This guide walks you through setting up and running your **Point of Sale** system locally using **XAMPP** with **PHP** and **MySQL**.

---

## Quick Setup Summary

| Component | Details |
| :--- | :--- |
| **Server Environment** | XAMPP (Apache + MySQL) |
| **Database Name** | `apexmoto_pos` |
| **Database Host / Port** | `localhost` (default port 3306) |
| **Database User / Pass** | Username: `root` \| Password: `""` (empty) |
| **SQL Import File** | `schema_mysql.sql` |
| **App Web URL** | `http://localhost/Point-of-Sale/` |

---

## Step 1: Copy Project Files to XAMPP `htdocs`

1. Open your XAMPP installation directory (usually `C:\xampp`).
2. Navigate to the `htdocs` folder: `C:\xampp\htdocs\`.
3. Copy or move your entire **Point-of-Sale** project folder into `htdocs`, so the path looks like:
   ```text
   C:\xampp\htdocs\Point-of-Sale\
   ```

---

## Step 2: Start Apache & MySQL in XAMPP

1. Open the **XAMPP Control Panel** (`C:\xampp\xampp-control.exe`).
2. Click **Start** next to **Apache**.
3. Click **Start** next to **MySQL**.
4. Both module indicators should turn **Green**.

---

## Step 3: Create & Import Database in phpMyAdmin

1. Open your browser and go to: **[http://localhost/phpmyadmin](http://localhost/phpmyadmin)**
2. Click on **Databases** tab at the top.
3. Under **Create database**:
   - Database name: `apexmoto_pos`
   - Collation: `utf8mb4_unicode_ci`
   - Click **Create**.
4. Click on `apexmoto_pos` from the left database list.
5. Click on the **Import** tab in the top navigation bar.
6. Click **Choose File** and select `schema_mysql.sql` from your project folder (`C:\xampp\htdocs\Point-of-Sale\schema_mysql.sql`).
7. Scroll down and click **Go** / **Import**.

> [!NOTE]
> `schema_mysql.sql` will automatically build all 11 required tables (`parts`, `customers`, `vehicles`, `service_jobs`, `service_job_parts`, `transactions`, `transaction_items`, `mechanics`, `labor_records`, `cash_outs`, `entry_capitals`) and pre-populate your store with initial parts and mechanics!

---

## Step 4: Open the POS Application

Once Apache and MySQL are running and the database is imported, open your web browser and navigate to:

- 🛒 **Main POS System**: **[http://localhost/Point-of-Sale/](http://localhost/Point-of-Sale/)** (or `http://localhost/Point-of-Sale/index.php`)
- 🖥️ **Customer Facing Display**: **[http://localhost/Point-of-Sale/customer.php](http://localhost/Point-of-Sale/customer.php)**
- 📱 **Mobile Inventory Scanner**: **[http://localhost/Point-of-Sale/mobile_inventory.php](http://localhost/Point-of-Sale/mobile_inventory.php)**

---

## Troubleshooting & Configuration

### Database Connection Settings
If you customized your MySQL username or password in XAMPP:
- Open `config/db.php` in a text editor.
- Update `$db_user` and `$db_pass` to match your XAMPP MySQL configuration:
  ```php
  $db_host = 'localhost';
  $db_name = 'apexmoto_pos';
  $db_user = 'root';
  $db_pass = ''; // your password here
  ```

### Port Conflicts
- If Apache fails to start due to port 80 being used, you can change Apache's port to `8080` in XAMPP settings and access the app at `http://localhost:8080/Point-of-Sale/`.
