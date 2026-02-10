import sqlite3, os
conn = sqlite3.connect(os.path.join('e:\\Audionyx\\backend\\instance', 'audionyx.db'))
c = conn.cursor()
c.execute('SELECT id, username, email, created_at FROM users ORDER BY id')
rows = c.fetchall()
with open('e:\\Audionyx\\backend\\users_list.txt', 'w') as f:
    f.write(f"Total accounts: {len(rows)}\n")
    f.write("-" * 70 + "\n")
    for r in rows:
        f.write(f"ID: {r[0]}\n")
        f.write(f"  Username: {r[1]}\n")
        f.write(f"  Email:    {r[2]}\n")
        f.write(f"  Created:  {r[3]}\n\n")
print("Written to users_list.txt")
conn.close()
