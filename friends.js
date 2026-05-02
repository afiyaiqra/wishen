const express = require('express');
const { dbAsync } = require('../database');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

// Search users by username
router.get('/search', authenticateToken, async (req, res) => {
    const { query } = req.query;
    if (!query || query.length < 2) return res.json([]);

    try {
        const users = await dbAsync.all(
            'SELECT id, username FROM users WHERE username LIKE ? AND id != ? LIMIT 10',
            [`%${query}%`, req.user.id]
        );
        res.json(users);
    } catch (err) {
        console.error('[Search Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send Friend Request
router.post('/request', authenticateToken, async (req, res) => {
    const { friend_id } = req.body;
    if (!friend_id) return res.status(400).json({ error: 'Friend ID required' });
    if (friend_id === req.user.id) return res.status(400).json({ error: 'Cannot add yourself' });

    try {
        const existing = await dbAsync.get(
            'SELECT * FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
            [req.user.id, friend_id, friend_id, req.user.id]
        );

        if (existing) {
            return res.status(400).json({ error: 'Friend request already exists or already friends' });
        }

        await dbAsync.run(
            'INSERT INTO friends (user_id, friend_id, status) VALUES (?, ?, ?)',
            [req.user.id, friend_id, 'pending']
        );

        await dbAsync.run(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [friend_id, `${req.user.username} sent you a friend request!`]
        );

        res.json({ message: 'Friend request sent' });
    } catch (err) {
        console.error('[Friend Request Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Accept/Reject Friend Request
router.post('/respond', authenticateToken, async (req, res) => {
    const { user_id, action } = req.body;
    if (!user_id || !['accept', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid input' });
    }

    try {
        const request = await dbAsync.get(
            'SELECT * FROM friends WHERE user_id = ? AND friend_id = ? AND status = ?',
            [user_id, req.user.id, 'pending']
        );

        if (!request) return res.status(404).json({ error: 'Friend request not found' });

        if (action === 'accept') {
            await dbAsync.run(
                'UPDATE friends SET status = ? WHERE user_id = ? AND friend_id = ?',
                ['accepted', user_id, req.user.id]
            );
            await dbAsync.run(
                'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
                [user_id, `${req.user.username} accepted your friend request!`]
            );
            res.json({ message: 'Request accepted' });
        } else {
            await dbAsync.run(
                'DELETE FROM friends WHERE user_id = ? AND friend_id = ?',
                [user_id, req.user.id]
            );
            res.json({ message: 'Request rejected' });
        }
    } catch (err) {
        console.error('[Respond Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Pending Requests (sent TO me)
router.get('/requests', authenticateToken, async (req, res) => {
    try {
        const requests = await dbAsync.all(
            `SELECT u.id, u.username
             FROM users u
             INNER JOIN friends f ON f.user_id = u.id
             WHERE f.friend_id = ? AND f.status = 'pending'`,
            [req.user.id]
        );
        res.json(requests);
    } catch (err) {
        console.error('[Requests Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Friends List (accepted)
router.get('/list', authenticateToken, async (req, res) => {
    try {
        const friends = await dbAsync.all(
            `SELECT u.id, u.username, u.is_private
             FROM users u
             INNER JOIN friends f
               ON (f.friend_id = u.id AND f.user_id = ?)
               OR (f.user_id = u.id AND f.friend_id = ?)
             WHERE f.status = 'accepted'`,
            [req.user.id, req.user.id]
        );
        res.json(friends);
    } catch (err) {
        console.error('[Friends List Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
