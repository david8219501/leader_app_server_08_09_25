require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

// בדיקה ש-JWT_SECRET קיים
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
    res.send('Server is running!');
});

// ===========================
// MANAGERS (מנהלות)
// ===========================

// רישום מנהלת חדשה
app.post('/register', (req, res) => {
    const { firstName, lastName, phone, email, password } = req.body;

    // Validation
    if (!firstName || !lastName || !phone || !email || !password) {
        return res.status(400).json({ message: 'חסרים פרטים' });
    }

    if (!/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ message: 'מספר טלפון לא תקין (צריך 10 ספרות)' });
    }

    if (password.length < 6) {
        return res.status(400).json({ message: 'הסיסמה חייבת להכיל לפחות 6 תווים' });
    }

    const stmt = db.prepare(`
        INSERT INTO managers (first_name, last_name, phone, email, password)
        VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(firstName, lastName, phone, email, password, function (err) {
        if (err) {
            return res.status(500).json({ message: 'מנהלת כבר קיימת או שגיאה במסד' });
        }
        res.status(201).json({ id: this.lastID, message: 'נרשמת בהצלחה' });
    });

    stmt.finalize();
});

// התחברות מנהלת קיימת
app.post('/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ message: 'אנא מלא אימייל וסיסמה' });
    }

    db.get(
        'SELECT * FROM managers WHERE email = ? AND password = ?',
        [email, password],
        (err, manager) => {
            if (err) return res.status(500).json({ message: 'שגיאה במסד' });
            if (!manager) return res.status(401).json({ message: 'האימייל או הסיסמה לא תואמים' });

            // יצירת Token
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
        }
    );
});

// קבלת פרטי המנהלת המחוברת
app.get('/manager/profile', authenticateToken, (req, res) => {
    const managerId = req.manager.id;

    db.get('SELECT * FROM managers WHERE id = ?', [managerId], (err, manager) => {
        if (err) return res.status(500).json({ message: 'שגיאה במסד' });
        if (!manager) return res.status(404).json({ message: 'מנהלת לא נמצאה' });

        res.json({
            id: manager.id,
            firstName: manager.first_name,
            lastName: manager.last_name,
            email: manager.email,
            phone: manager.phone,
        });
    });
});

// עדכון פרטי המנהלת
app.put('/manager/profile', authenticateToken, (req, res) => {
    const managerId = req.manager.id;
    const { firstName, lastName, phone, email } = req.body;

    if (!firstName || !lastName || !email) {
        return res.status(400).json({ message: 'שם ואימייל חובה' });
    }

    if (phone && !/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ message: 'מספר טלפון לא תקין' });
    }

    const stmt = db.prepare(`
        UPDATE managers 
        SET first_name = ?, last_name = ?, phone = ?, email = ?
        WHERE id = ?
    `);

    stmt.run(firstName, lastName, phone, email, managerId, function (err) {
        if (err) {
            return res.status(500).json({ message: 'שגיאה בעדכון הפרטים' });
        }
        res.json({ message: 'הפרטים עודכנו בהצלחה' });
    });

    stmt.finalize();
});

// שינוי סיסמה
app.put('/manager/password', authenticateToken, (req, res) => {
    const managerId = req.manager.id;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'יש למלא את שתי הסיסמאות' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ message: 'הסיסמה החדשה חייבת להכיל לפחות 6 תווים' });
    }

    // בדיקת סיסמה נוכחית
    db.get('SELECT * FROM managers WHERE id = ?', [managerId], (err, manager) => {
        if (err) return res.status(500).json({ message: 'שגיאה במסד' });
        if (!manager) return res.status(404).json({ message: 'מנהלת לא נמצאה' });

        if (manager.password !== currentPassword) {
            return res.status(401).json({ message: 'הסיסמה הנוכחית שגויה' });
        }

        // עדכון סיסמה
        const stmt = db.prepare('UPDATE managers SET password = ? WHERE id = ?');
        stmt.run(newPassword, managerId, function (err) {
            if (err) return res.status(500).json({ message: 'שגיאה בעדכון הסיסמה' });
            res.json({ message: 'הסיסמה שונתה בהצלחה' });
        });
        stmt.finalize();
    });
});

// ===========================
// EMPLOYEES (עובדות)
// ===========================

// הוספת עובדת חדשה
app.post('/employees', authenticateToken, (req, res) => {
    const { firstName, lastName, phone } = req.body;
    const managerId = req.manager.id;

    if (!firstName || !lastName) {
        return res.status(400).json({ message: 'שם פרטי ושם משפחה חובה' });
    }

    if (phone && !/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ message: 'מספר טלפון לא תקין' });
    }

    const stmt = db.prepare(`
        INSERT INTO employees (first_name, last_name, phone, manager_id)
        VALUES (?, ?, ?, ?)
    `);

    stmt.run(firstName, lastName, phone || null, managerId, function (err) {
        if (err) return res.status(500).json({ message: 'שגיאה במסד בעת הוספת עובדת' });
        res.status(201).json({ id: this.lastID, message: 'העובדת נוספה בהצלחה' });
    });

    stmt.finalize();
});

// קבלת עובדות של המנהלת המחוברת
app.get('/employees', authenticateToken, (req, res) => {
    const managerId = req.manager.id;

    db.all('SELECT * FROM employees WHERE manager_id = ?', [managerId], (err, rows) => {
        if (err) return res.status(500).json({ message: 'שגיאה בשליפת נתוני עובדות' });
        res.json(rows);
    });
});

// עדכון עובדת
app.put('/employees/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { firstName, lastName, phone } = req.body;
    const managerId = req.manager.id;

    if (!firstName || !lastName) {
        return res.status(400).json({ message: 'שם פרטי ושם משפחה חובה' });
    }

    if (phone && !/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ message: 'מספר טלפון לא תקין' });
    }

    // בדיקה שהעובדת שייכת למנהלת הזו
    db.get('SELECT * FROM employees WHERE id = ? AND manager_id = ?', [id, managerId], (err, emp) => {
        if (err) return res.status(500).json({ message: 'שגיאה במסד' });
        if (!emp) return res.status(403).json({ message: 'אין הרשאה לעדכן עובדת זו' });

        const stmt = db.prepare(`
            UPDATE employees 
            SET first_name = ?, last_name = ?, phone = ?
            WHERE id = ?
        `);

        stmt.run(firstName, lastName, phone || null, id, function (err) {
            if (err) return res.status(500).json({ message: 'שגיאה בעדכון העובדת' });
            res.json({ message: 'העובדת עודכנה בהצלחה' });
        });

        stmt.finalize();
    });
});

// מחיקת עובדת
app.delete('/employees/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const managerId = req.manager.id;

    // בדיקה שהעובדת שייכת למנהלת הזו
    db.get('SELECT * FROM employees WHERE id = ? AND manager_id = ?', [id, managerId], (err, emp) => {
        if (err) return res.status(500).json({ message: 'שגיאה במסד' });
        if (!emp) return res.status(403).json({ message: 'אין הרשאה למחוק עובדת זו' });

        const stmt = db.prepare('DELETE FROM employees WHERE id = ?');

        stmt.run(id, function (err) {
            if (err) return res.status(500).json({ message: 'שגיאה במחיקת העובדת' });
            res.json({ message: 'העובדת נמחקה בהצלחה' });
        });

        stmt.finalize();
    });
});

// ===========================
// SHIFTS (משמרות)
// ===========================

// שמירת משמרת
app.post('/shifts', authenticateToken, (req, res) => {
    const { employeeId, day, shiftType, weekStartDate } = req.body;
    const managerId = req.manager.id;

    if (!employeeId || !day || !shiftType || !weekStartDate) {
        return res.status(400).json({ message: 'חסרים פרטים' });
    }

    const stmt = db.prepare(`
        INSERT INTO shifts (manager_id, employee_id, day, shift_type, week_start_date)
        VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(managerId, employeeId, day, shiftType, weekStartDate, function (err) {
        if (err) return res.status(500).json({ message: 'שגיאה בשמירת המשמרת' });
        res.status(201).json({ id: this.lastID, message: 'המשמרת נשמרה' });
    });

    stmt.finalize();
});

// קבלת משמרות לשבוע מסוים
app.get('/shifts/:weekStart', authenticateToken, (req, res) => {
    const { weekStart } = req.params;
    const managerId = req.manager.id;

    db.all(
        'SELECT * FROM shifts WHERE manager_id = ? AND week_start_date = ?',
        [managerId, weekStart],
        (err, rows) => {
            if (err) return res.status(500).json({ message: 'שגיאה בשליפת משמרות' });
            res.json(rows);
        }
    );
});

// מחיקת משמרות ליום ומשמרת ספציפיים
app.delete('/shifts/:weekStart/:day/:shiftType', authenticateToken, (req, res) => {
    const { weekStart, day, shiftType } = req.params;
    const managerId = req.manager.id;

    db.run(
        'DELETE FROM shifts WHERE manager_id = ? AND week_start_date = ? AND day = ? AND shift_type = ?',
        [managerId, weekStart, day, shiftType],
        (err) => {
            if (err) return res.status(500).json({ message: 'שגיאה במחיקת משמרות' });
            res.json({ message: 'משמרות נמחקו' });
        }
    );
});

// מחיקת כל המשמרות של שבוע (לאיפוס)
app.delete('/shifts/:weekStart', authenticateToken, (req, res) => {
    const { weekStart } = req.params;
    const managerId = req.manager.id;

    db.run(
        'DELETE FROM shifts WHERE manager_id = ? AND week_start_date = ?',
        [managerId, weekStart],
        (err) => {
            if (err) return res.status(500).json({ message: 'שגיאה באיפוס השבוע' });
            res.json({ message: 'השבוע אופס בהצלחה' });
        }
    );
});

// ===========================
// הפעלת השרת
// ===========================
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});