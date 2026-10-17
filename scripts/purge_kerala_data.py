"""
Purge All Remaining Kerala Data from JEEVAN Database.
Safely removes legacy Kerala records (requests, alerts, donors, users, coordinates)
and updates old Thrissur credentials/labels to Chennai standard.
"""

import shutil
import sqlite3
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DB_PATH = PROJECT_ROOT / "jeevan.db"

def purge_kerala_data():
    if not DB_PATH.is_file():
        print(f"Database {DB_PATH} not found.")
        return

    # 1. Create timestamped safety backup
    backup_dir = PROJECT_ROOT / "backups" / "pre_kerala_purge"
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup_file = backup_dir / f"jeevan_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db.bak"
    shutil.copy2(DB_PATH, backup_file)
    print(f"[1/5] Safety database backup created: {backup_file.relative_to(PROJECT_ROOT)}")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        # 2. Identify Kerala Blood Requests
        kerala_req_query = """
            SELECT id FROM blood_requests 
            WHERE (hospital_latitude IS NOT NULL AND hospital_latitude < 11.5) 
               OR hospital_name LIKE '%Jubilee%' 
               OR hospital_name LIKE '%Elite%' 
               OR hospital_name LIKE '%Westfort%' 
               OR hospital_name LIKE '%Thrissur%' 
               OR hospital_name LIKE '%Kerala%'
        """
        kerala_req_ids = [r[0] for r in cursor.execute(kerala_req_query).fetchall()]
        print(f"[2/5] Found {len(kerala_req_ids)} legacy Kerala blood requests to purge.")

        # Clean cascade references for these requests
        if kerala_req_ids:
            placeholders = ",".join("?" for _ in kerala_req_ids)
            
            cur_del_matches = cursor.execute(f"DELETE FROM matches WHERE request_id IN ({placeholders})", kerala_req_ids).rowcount
            print(f"      Removed {cur_del_matches} associated matches.")
            
            cur_del_res = cursor.execute(f"DELETE FROM reservations WHERE request_id IN ({placeholders})", kerala_req_ids).rowcount
            print(f"      Removed {cur_del_res} associated reservations.")
            
            cur_del_audit = cursor.execute(f"DELETE FROM audit_logs WHERE entity_id IN ({placeholders})", kerala_req_ids).rowcount
            print(f"      Removed {cur_del_audit} associated audit logs.")
            
            cur_del_reqs = cursor.execute(f"DELETE FROM blood_requests WHERE id IN ({placeholders})", kerala_req_ids).rowcount
            print(f"      Purged {cur_del_reqs} Kerala blood requests.")

        # 3. Purge Kerala Donor Alerts
        del_alerts = cursor.execute("""
            DELETE FROM donor_alerts 
            WHERE message LIKE '%Thrissur%' 
               OR message LIKE '%Kerala%' 
               OR message LIKE '%Jubilee%' 
               OR message LIKE '%Elite%' 
               OR message LIKE '%Westfort%'
        """).rowcount
        print(f"[3/5] Purged {del_alerts} Kerala donor alerts.")

        # 4. Purge Kerala Donors & Any Kerala Hospitals / Blood Banks
        del_donors = cursor.execute("""
            DELETE FROM donors 
            WHERE (latitude IS NOT NULL AND latitude < 11.5) 
               OR city LIKE '%Thrissur%' 
               OR area LIKE '%Thrissur%'
               OR city LIKE '%Kerala%'
        """).rowcount
        print(f"[4/5] Purged {del_donors} legacy Kerala donors.")

        del_hosp = cursor.execute("""
            DELETE FROM hospitals 
            WHERE state = 'Kerala' OR city = 'Thrissur' OR (latitude IS NOT NULL AND latitude < 11.5)
        """).rowcount
        if del_hosp:
            print(f"      Purged {del_hosp} legacy Kerala hospitals.")

        del_banks = cursor.execute("""
            DELETE FROM blood_banks 
            WHERE state = 'Kerala' OR city = 'Thrissur' OR (latitude IS NOT NULL AND latitude < 11.5)
        """).rowcount
        if del_banks:
            print(f"      Purged {del_banks} legacy Kerala blood banks.")

        # 5. Clean / Update Kerala Users
        # usr-bank-01 had ima.admin@imathrissur.org -> update to Chennai Red Cross
        updated_bank_user = cursor.execute("""
            UPDATE users 
            SET email = 'redcross.admin@redcrosschennai.org' 
            WHERE id = 'usr-bank-01' AND email LIKE '%thrissur%'
        """).rowcount
        if updated_bank_user:
            print("      Updated usr-bank-01 email to redcross.admin@redcrosschennai.org.")

        # Delete any user associated with purged donor or containing kerala/thrissur
        del_users = cursor.execute("""
            DELETE FROM users 
            WHERE id = 'usr-538c5e94' 
               OR email LIKE '%kerala%' 
               OR email LIKE '%thrissur%'
        """).rowcount
        if del_users:
            print(f"      Purged {del_users} legacy Kerala user accounts.")

        conn.commit()
        print("\n[5/5] Purge complete! Database committed successfully.")

    except Exception as exc:
        conn.rollback()
        print(f"Error during purge: {exc}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    purge_kerala_data()
