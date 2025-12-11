const sqlite3 = require('sqlite3').verbose();

// יצירת מסד הנתונים users.db (אם לא קיים)
const db = new sqlite3.Database('./users.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database.');
    }
});

// יצירת טבלאות
db.serialize(() => {
    // טבלת מנהלות
    db.run(`
        CREATE TABLE IF NOT EXISTS managers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            phone TEXT NOT NULL UNIQUE,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
        )
    `);

    // טבלת עובדות
    db.run(`
        CREATE TABLE IF NOT EXISTS employees (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            first_name TEXT NOT NULL,
            last_name TEXT NOT NULL,
            phone TEXT,
            manager_id INTEGER NOT NULL,
            FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE
        )
    `);

    // ✅ טבלת משמרות - חדש!
    db.run(`
        CREATE TABLE IF NOT EXISTS shifts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            manager_id INTEGER NOT NULL,
            employee_id INTEGER NOT NULL,
            day TEXT NOT NULL,
            shift_type TEXT NOT NULL,
            week_start_date TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE,
            FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
        )
    `);

    // אינדקס לשיפור ביצועים
    db.run(`
        CREATE INDEX IF NOT EXISTS idx_shifts_lookup 
        ON shifts(manager_id, week_start_date, day, shift_type)
    `);

    console.log('✅ Database & tables ready!');
});

module.exports = db;