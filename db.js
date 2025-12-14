const { Pool } = require('pg');

// חיבור ל-PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? {
        rejectUnauthorized: false
    } : false
});

// בדיקת חיבור
pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error connecting to PostgreSQL:', err.message);
        return;
    }
    console.log('✅ Connected to PostgreSQL database');
    release();
});

// יצירת הטבלאות
const initDatabase = async () => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // טבלת מנהלות
        await client.query(`
            CREATE TABLE IF NOT EXISTS managers (
                id SERIAL PRIMARY KEY,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                phone TEXT NOT NULL UNIQUE,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // טבלת עובדות
        await client.query(`
            CREATE TABLE IF NOT EXISTS employees (
                id SERIAL PRIMARY KEY,
                first_name TEXT NOT NULL,
                last_name TEXT NOT NULL,
                phone TEXT,
                manager_id INTEGER NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE
            )
        `);

        // טבלת משמרות - employee_id הוא TEXT (לתמיכה ב-prefix)
        await client.query(`
            CREATE TABLE IF NOT EXISTS shifts (
                id SERIAL PRIMARY KEY,
                manager_id INTEGER NOT NULL,
                employee_id TEXT NOT NULL,
                day TEXT NOT NULL,
                shift_type TEXT NOT NULL,
                week_start_date TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE
            )
        `);

        // אינדקס לשיפור ביצועים
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_shifts_lookup 
            ON shifts(manager_id, week_start_date, day, shift_type)
        `);

        // ⚠️ אם הטבלה כבר קיימת עם employee_id INTEGER, נשנה ל-TEXT
        try {
            await client.query(`
                ALTER TABLE shifts 
                ALTER COLUMN employee_id TYPE TEXT
            `);
            console.log('✅ Updated employee_id column to TEXT');
        } catch (alterErr) {
            // אם העמודה כבר TEXT או אם השינוי נכשל - זה בסדר
            console.log('ℹ️ employee_id column already TEXT or no changes needed');
        }

        await client.query('COMMIT');
        console.log('✅ Database tables initialized successfully');
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error initializing database:', err.message);
    } finally {
        client.release();
    }
};

// הרצת האתחול (לא חוסם)
initDatabase().catch(err => {
    console.error('Failed to initialize database:', err);
});

module.exports = pool;