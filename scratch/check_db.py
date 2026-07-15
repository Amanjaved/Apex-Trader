import sqlite3
import json

conn = sqlite3.connect('backend/repositories/paper_trading.db')
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in cursor.fetchall()]
print("Tables in DB:", tables)

for table in tables:
    cursor.execute(f"SELECT COUNT(*) FROM {table}")
    count = cursor.fetchone()[0]
    print(f"Table '{table}' has {count} rows")
    
    # Print schema
    cursor.execute(f"PRAGMA table_info({table})")
    schema = [f"{col[1]} ({col[2]})" for col in cursor.fetchall()]
    print(f"  Schema: {', '.join(schema)}")
    
    # Print sample data
    cursor.execute(f"SELECT * FROM {table} LIMIT 3")
    rows = cursor.fetchall()
    if rows:
        print("  Sample:")
        for r in rows:
            print("    ", dict(r))
            
# Also let's check if there are unresolved signals or specific stats
cursor.execute("SELECT outcome_status, COUNT(*) FROM signal_log GROUP BY outcome_status")
print("Signal Log Outcomes:", cursor.fetchall())
conn.close()
