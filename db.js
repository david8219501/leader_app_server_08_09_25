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

        // טבלת משמרות
        await client.query(`
            CREATE TABLE IF NOT EXISTS shifts (
                id SERIAL PRIMARY KEY,
                manager_id INTEGER NOT NULL,
                employee_id INTEGER NOT NULL,
                day TEXT NOT NULL,
                shift_type TEXT NOT NULL,
                week_start_date TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (manager_id) REFERENCES managers(id) ON DELETE CASCADE,
                FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
            )
        `);

        // אינדקס לשיפור ביצועים
        await client.query(`
            CREATE INDEX IF NOT EXISTS idx_shifts_lookup 
            ON shifts(manager_id, week_start_date, day, shift_type)
        `);

        await client.query('COMMIT');
        console.log('✅ Database tables initialized successfully');
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ Error initializing database:', err.message);
        throw err;
    } finally {
        client.release();
    }
};

// הרצת האתחול
initDatabase().catch(console.error);

module.exports = pool;