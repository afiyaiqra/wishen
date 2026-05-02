const express = require('express');
const { dbAsync } = require('../database');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

// Get all conversations (list of friends I've messaged or who messaged me)
router.get('/conversations', authenticateToken, async (req, res) => {
    try {
        const convos = await dbAsync.all(`
            SELECT 
                u.id, u.username,
                m.content AS last_message,
                m.created_at AS last_time,
                m.sender_id,
                (SELECT COUNT(*) FROM messages 
                 WHERE receiver_id = ? AND sender_id = u.id AND is_read = 0) AS unread_count
            FROM users u
            INNER JOIN friends f ON 
                (f.user_id = ? AND f.friend_id = u.id) OR 
                (f.friend_id = ? AND f.user_id = u.id)
            LEFT JOIN messages m ON m.id = (
                SELECT id FROM messages 
                WHERE (sender_id = ? AND receiver_id = u.id) 
                   OR (sender_id = u.id AND receiver_id = ?)
                ORDER BY created_at DESC LIMIT 1
            )
            WHERE f.status = 'accepted'
            ORDER BY m.created_at DESC
        `, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]);
        res.json(convos);
    } catch (err) {
        console.error('[Conversations Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get messages between me and a friend
router.get('/:friendId', authenticateToken, async (req, res) => {
    const friendId = parseInt(req.params.friendId);
    try {
        // Mark messages as read
        await dbAsync.run(
            'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ?',
            [friendId, req.user.id]
        );

        const messages = await dbAsync.all(`
            SELECT m.id, m.content, m.created_at, m.sender_id, m.is_read,
                   u.username AS sender_name
            FROM messages m
            JOIN users u ON u.id = m.sender_id
            WHERE (m.sender_id = ? AND m.receiver_id = ?)
               OR (m.sender_id = ? AND m.receiver_id = ?)
            ORDER BY m.created_at ASC
        `, [req.user.id, friendId, friendId, req.user.id]);

        res.json(messages);
    } catch (err) {
        console.error('[Get Messages Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send a message
router.post('/send', authenticateToken, async (req, res) => {
    const { receiver_id, content } = req.body;
    if (!receiver_id || !content || !content.trim()) {
        return res.status(400).json({ error: 'Receiver and message content required' });
    }

    try {
        // Verify they are friends
        const isFriend = await dbAsync.get(`
            SELECT * FROM friends 
            WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
            AND status = 'accepted'
        `, [req.user.id, receiver_id, receiver_id, req.user.id]);

        if (!isFriend) return res.status(403).json({ error: 'You can only message friends' });

        const result = await dbAsync.run(
            'INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)',
            [req.user.id, receiver_id, content.trim()]
        );

        const newMsg = await dbAsync.get(
            'SELECT m.*, u.username AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.id = ?',
            [result.lastID]
        );

        res.status(201).json(newMsg);
    } catch (err) {
        console.error('[Send Message Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get unread message count
router.get('/unread/count', authenticateToken, async (req, res) => {
    try {
        const row = await dbAsync.get(
            'SELECT COUNT(*) AS count FROM messages WHERE receiver_id = ? AND is_read = 0',
            [req.user.id]
        );
        res.json({ count: row.count });
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
