if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    console.error('ERROR: JWT_SECRET is missing in .env file!');
    process.exit(1);
}

app.use(cors());
app.use(bodyParser.json());

// ===========================
// Middleware לאימות Token
// ===========================
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'אין Token' });
    }

    jwt.verify(token, JWT_SECRET, (err, manager) => {
        if (err) {
            return res.status(403).json({ message: 'Token לא תקין' });
        }
        req.manager = manager;
        next();
    });
};

// ===========================
// בדיקה שהשרת רץ
// ===========================
app.get('/', (req, res) => {
    res.send('Server is running with PostgreSQL! 🚀');
});

// ===========================
// MANAGERS (מנהלות)
// ===========================

// רישום מנהלת חדשה
app.post('/register', async (req, res) => {
    const { firstName, lastName, phone, email, password } = req.body;

    if (!firstName || !lastName || !phone || !email || !password) {
        return res.status(400).json({ message: 'חסרים פרטים' });
    }

    if (!/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ message: 'מספר טלפון לא תקין (צריך 10 ספרות)' });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: 'הסיסמה חייבת להכיל לפחות 6 תווים' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO managers (first_name, last_name, phone, email, password)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [firstName, lastName, phone, email, password]
        );
        
        res.status(201).json({ 
            id: result.rows[0].id, 
            message: 'נרשמת בהצלחה' 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'מנהלת כבר קיימת או שגיאה במסד' });
    }
});

// התחברות מנהלת קיימת
app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'אנא מלא אימייל וסיסמה' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM managers WHERE email = $1 AND password = $2',
            [email, password]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ message: 'האימייל או הסיסמה לא תואמים' });
        }

        const manager = result.rows[0];
        const token = jwt.sign(
            { id: manager.id, email: manager.email },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.json({
            token,
            manager: {
                id: manager.id,
                firstName: manager.first_name,
                lastName: manager.last_name,
                email: manager.email,
                phone: manager.phone,
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה במסד' });
    }
});

// קבלת פרטי המנהלת המחוברת
app.get('/manager/profile', authenticateToken, async (req, res) => {
    const managerId = req.manager.id;

    try {
        const result = await pool.query(
            'SELECT * FROM managers WHERE id = $1',
            [managerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'מנהלת לא נמצאה' });
        }

        const manager = result.rows[0];
        res.json({
            id: manager.id,
            firstName: manager.first_name,
            lastName: manager.last_name,
            email: manager.email,
            phone: manager.phone,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה במסד' });
    }
});

// עדכון פרטי המנהלת
app.put('/manager/profile', authenticateToken, async (req, res) => {
    const managerId = req.manager.id;
    const { firstName, lastName, phone, email } = req.body;

    if (!firstName || !lastName || !email) {
        return res.status(400).json({ message: 'שם ואימייל חובה' });
    }

    if (phone && !/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ message: 'מספר טלפון לא תקין' });
    }

    try {
        await pool.query(
            `UPDATE managers 
             SET first_name = $1, last_name = $2, phone = $3, email = $4
             WHERE id = $5`,
            [firstName, lastName, phone, email, managerId]
        );
        
        res.json({ message: 'הפרטים עודכנו בהצלחה' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה בעדכון הפרטים' });
    }
});

// שינוי סיסמה
app.put('/manager/password', authenticateToken, async (req, res) => {
    const managerId = req.manager.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'יש למלא את שתי הסיסמאות' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'הסיסמה החדשה חייבת להכיל לפחות 6 תווים' });
    }

    try {
        const result = await pool.query(
            'SELECT * FROM managers WHERE id = $1',
            [managerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'מנהלת לא נמצאה' });
        }

        const manager = result.rows[0];
        if (manager.password !== currentPassword) {
            return res.status(401).json({ message: 'הסיסמה הנוכחית שגויה' });
        }

        await pool.query(
            'UPDATE managers SET password = $1 WHERE id = $2',
            [newPassword, managerId]
        );

        res.json({ message: 'הסיסמה שונתה בהצלחה' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה בעדכון הסיסמה' });
    }
});

// ===========================
// EMPLOYEES (עובדות)
// ===========================

// הוספת עובדת חדשה
app.post('/employees', authenticateToken, async (req, res) => {
    const { firstName, lastName, phone } = req.body;
    const managerId = req.manager.id;

    if (!firstName || !lastName) {
        return res.status(400).json({ message: 'שם פרטי ושם משפחה חובה' });
    }

    if (phone && !/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ message: 'מספר טלפון לא תקין' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO employees (first_name, last_name, phone, manager_id)
             VALUES ($1, $2, $3, $4) RETURNING id`,
            [firstName, lastName, phone || null, managerId]
        );

        res.status(201).json({ 
            id: result.rows[0].id, 
            message: 'העובדת נוספה בהצלחה' 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה במסד בעת הוספת עובדת' });
    }
});

// קבלת עובדות של המנהלת המחוברת
app.get('/employees', authenticateToken, async (req, res) => {
    const managerId = req.manager.id;

    try {
        const result = await pool.query(
            'SELECT * FROM employees WHERE manager_id = $1 ORDER BY id',
            [managerId]
        );
        
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה בשליפת נתוני עובדות' });
    }
});

// עדכון עובדת
app.put('/employees/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { firstName, lastName, phone } = req.body;
    const managerId = req.manager.id;

    if (!firstName || !lastName) {
        return res.status(400).json({ message: 'שם פרטי ושם משפחה חובה' });
    }

    if (phone && !/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ message: 'מספר טלפון לא תקין' });
    }

    try {
        const checkResult = await pool.query(
            'SELECT * FROM employees WHERE id = $1 AND manager_id = $2',
            [id, managerId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(403).json({ message: 'אין הרשאה לעדכן עובדת זו' });
        }

        await pool.query(
            `UPDATE employees 
             SET first_name = $1, last_name = $2, phone = $3
             WHERE id = $4`,
            [firstName, lastName, phone || null, id]
        );

        res.json({ message: 'העובדת עודכנה בהצלחה' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה בעדכון העובדת' });
    }
});

// מחיקת עובדת
app.delete('/employees/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const managerId = req.manager.id;

    try {
        const checkResult = await pool.query(
            'SELECT * FROM employees WHERE id = $1 AND manager_id = $2',
            [id, managerId]
        );

        if (checkResult.rows.length === 0) {
            return res.status(403).json({ message: 'אין הרשאה למחוק עובדת זו' });
        }

        await pool.query('DELETE FROM employees WHERE id = $1', [id]);
        res.json({ message: 'העובדת נמחקה בהצלחה' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה במחיקת העובדת' });
    }
});

// ===========================
// SHIFTS (משמרות)
// ===========================

// שמירת משמרת
app.post('/shifts', authenticateToken, async (req, res) => {
    const { employeeId, day, shiftType, weekStartDate } = req.body;
    const managerId = req.manager.id;

    if (!employeeId || !day || !shiftType || !weekStartDate) {
        return res.status(400).json({ message: 'חסרים פרטים' });
    }

    try {
        const result = await pool.query(
            `INSERT INTO shifts (manager_id, employee_id, day, shift_type, week_start_date)
             VALUES ($1, $2, $3, $4, $5) RETURNING id`,
            [managerId, employeeId, day, shiftType, weekStartDate]
        );

        res.status(201).json({ 
            id: result.rows[0].id, 
            message: 'המשמרת נשמרה' 
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה בשמירת המשמרת' });
    }
});

// קבלת משמרות לשבוע מסוים
app.get('/shifts/:weekStart', authenticateToken, async (req, res) => {
    const { weekStart } = req.params;
    const managerId = req.manager.id;

    try {
        const result = await pool.query(
            'SELECT * FROM shifts WHERE manager_id = $1 AND week_start_date = $2',
            [managerId, weekStart]
        );

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה בשליפת משמרות' });
    }
});

// מחיקת משמרות ליום ומשמרת ספציפיים
app.delete('/shifts/:weekStart/:day/:shiftType', authenticateToken, async (req, res) => {
    const { weekStart, day, shiftType } = req.params;
    const managerId = req.manager.id;

    try {
        await pool.query(
            `DELETE FROM shifts 
             WHERE manager_id = $1 AND week_start_date = $2 AND day = $3 AND shift_type = $4`,
            [managerId, weekStart, day, shiftType]
        );

        res.json({ message: 'משמרות נמחקו' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה במחיקת משמרות' });
    }
});

// מחיקת כל המשמרות של שבוע (לאיפוס)
app.delete('/shifts/:weekStart', authenticateToken, async (req, res) => {
    const { weekStart } = req.params;
    const managerId = req.manager.id;

    try {
        await pool.query(
            'DELETE FROM shifts WHERE manager_id = $1 AND week_start_date = $2',
            [managerId, weekStart]
        );

        res.json({ message: 'השבוע אופס בהצלחה' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'שגיאה באיפוס השבוע' });
    }
});

// ===========================
// הפעלת השרת
// ===========================
const startServer = async () => {
    try {
        // בדיקה שה-DB מוכן
        await pool.query('SELECT 1');
        console.log('✅ Database connection verified');
        
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV}`);
        });

        // Handle graceful shutdown
        process.on('SIGTERM', () => {
            console.log('⚠️ SIGTERM received, closing server gracefully...');
            server.close(() => {
                console.log('✅ Server closed');
                process.exit(0);
            });
        });

    } catch (err) {
        console.error('❌ Failed to start server:', err);
        process.exit(1);
    }
};

startServer();