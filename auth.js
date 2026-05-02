const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { dbAsync } = require('../database');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'wishen_super_secret_key_2026';

// Email Transporter
const createTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.ethereal.email',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || ''
        }
    });
};

// Register
router.post('/register', async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    // Validate username (alphanumeric + underscore only)
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
    }

    try {
        const existing = await dbAsync.get('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existing) {
            return res.status(409).json({ error: 'Username or email already in use.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        await dbAsync.run(
            'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)',
            [username, email, hashedPassword]
        );

        res.status(201).json({ message: 'Account created successfully!' });
    } catch (err) {
        console.error('[Register Error]', err);
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
        return res.status(400).json({ error: 'Please provide username/email and password.' });
    }

    try {
        const user = await dbAsync.get('SELECT * FROM users WHERE username = ? OR email = ?', [identifier, identifier]);
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const token = jwt.sign(
            { id: user.id, username: user.username },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            message: 'Logged in successfully',
            token,
            user: { id: user.id, username: user.username, is_private: user.is_private }
        });
    } catch (err) {
        console.error('[Login Error]', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// Get current user profile
router.get('/me', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'No token' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await dbAsync.get('SELECT id, username, email, is_private, created_at FROM users WHERE id = ?', [decoded.id]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(403).json({ error: 'Invalid token' });
    }
});

// Forgot Password
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    try {
        const user = await dbAsync.get('SELECT id FROM users WHERE email = ?', [email]);
        if (!user) {
            return res.json({ message: 'If the email exists, a reset link has been sent.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + 15 * 60 * 1000; // 15 mins

        await dbAsync.run('UPDATE users SET reset_token = ?, reset_expiry = ? WHERE id = ?', [resetToken, expiry, user.id]);

        // Reset link (when you deploy, replace localhost with your domain)
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5500';
        const resetLink = `${frontendUrl}/reset-password.html?token=${resetToken}`;

        // Only send if SMTP is configured
        if (process.env.SMTP_USER) {
            try {
                const transporter = createTransporter();
                await transporter.sendMail({
                    from: `"Wishen 🌸" <${process.env.SMTP_USER}>`,
                    to: email,
                    subject: '🔐 Password Reset - Wishen',
                    html: `
                        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 2rem; background: #fff9f0; border-radius: 16px; border: 2px dashed #fca5a5;">
                            <h2 style="color: #f87171;">Reset Your Password 🌸</h2>
                            <p>Hi there! You requested a password reset for your Wishen account.</p>
                            <a href="${resetLink}" style="display:inline-block; padding: 1rem 2rem; background: linear-gradient(135deg, #fca5a5, #fbcfe8); border-radius: 50px; text-decoration: none; color: #475569; font-weight: 700;">Reset My Password</a>
                            <p style="color: #9ca3af; margin-top: 1rem; font-size: 0.85rem;">This link expires in 15 minutes. If you didn't request this, ignore this email.</p>
                        </div>
                    `
                });
                console.log('[Email] Reset email sent to:', email);
            } catch (mailErr) {
                console.error('[Email Error]', mailErr.message);
            }
        } else {
            // Log the reset link to console in dev mode
            console.log('[DEV] Password reset link:', resetLink);
        }

        res.json({ message: 'If the email exists, a reset link has been sent.' });
    } catch (err) {
        console.error('[Forgot Password Error]', err);
        res.status(500).json({ error: 'Server error during forgot password.' });
    }
});

// Reset Password
router.post('/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Invalid input. Password must be at least 6 characters.' });
    }

    try {
        const user = await dbAsync.get('SELECT id, reset_expiry FROM users WHERE reset_token = ?', [token]);

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired token.' });
        }

        if (Date.now() > parseInt(user.reset_expiry)) {
            return res.status(400).json({ error: 'Token has expired. Please request a new one.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);

        await dbAsync.run(
            'UPDATE users SET password_hash = ?, reset_token = NULL, reset_expiry = NULL WHERE id = ?',
            [hashedPassword, user.id]
        );

        res.json({ message: 'Password has been reset successfully.' });
    } catch (err) {
        console.error('[Reset Password Error]', err);
        res.status(500).json({ error: 'Server error during reset password.' });
    }
});

module.exports = router;
