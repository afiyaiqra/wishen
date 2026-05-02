const express = require('express');
const { dbAsync } = require('../database');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

// Get My Wishlist Items
router.get('/', authenticateToken, async (req, res) => {
    try {
        const items = await dbAsync.all(
            'SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC',
            [req.user.id]
        );
        res.json(items);
    } catch (err) {
        console.error('[Get Wishlist Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Friend's Wishlist
router.get('/friend/:friendId', authenticateToken, async (req, res) => {
    const friendId = parseInt(req.params.friendId);

    try {
        // Check if they are accepted friends
        const isFriend = await dbAsync.get(
            `SELECT * FROM friends 
             WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) 
             AND status = 'accepted'`,
            [req.user.id, friendId, friendId, req.user.id]
        );

        if (!isFriend) return res.status(403).json({ error: 'You are not friends with this user' });

        const friendUser = await dbAsync.get('SELECT is_private FROM users WHERE id = ?', [friendId]);
        if (!friendUser) return res.status(404).json({ error: 'User not found' });
        if (friendUser.is_private) return res.status(403).json({ error: 'This wishlist is private' });

        const items = await dbAsync.all(
            'SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC',
            [friendId]
        );

        // Hide who reserved — only show boolean
        const safeItems = items.map(item => ({
            id: item.id,
            title: item.title,
            description: item.description,
            price: item.price,
            link: item.link,
            image_url: item.image_url,
            is_reserved: item.reserved_by_id !== null,
            reserved_by_me: item.reserved_by_id === req.user.id
        }));

        res.json(safeItems);
    } catch (err) {
        console.error('[Friend Wishlist Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add Item
router.post('/item', authenticateToken, async (req, res) => {
    const { title, description, price, link, image_url } = req.body;
    if (!title || title.trim() === '') {
        return res.status(400).json({ error: 'Title is required' });
    }

    try {
        const result = await dbAsync.run(
            'INSERT INTO items (user_id, title, description, price, link, image_url) VALUES (?, ?, ?, ?, ?, ?)',
            [req.user.id, title.trim(), description || null, price || null, link || null, image_url || null]
        );
        res.status(201).json({ message: 'Item added', id: result.lastID });
    } catch (err) {
        console.error('[Add Item Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update Item
router.put('/item/:id', authenticateToken, async (req, res) => {
    const { title, description, price, link, image_url } = req.body;
    if (!title) return res.status(400).json({ error: 'Title is required' });

    try {
        const item = await dbAsync.get('SELECT id FROM items WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!item) return res.status(404).json({ error: 'Item not found' });

        await dbAsync.run(
            'UPDATE items SET title = ?, description = ?, price = ?, link = ?, image_url = ? WHERE id = ? AND user_id = ?',
            [title, description || null, price || null, link || null, image_url || null, req.params.id, req.user.id]
        );
        res.json({ message: 'Item updated' });
    } catch (err) {
        console.error('[Update Item Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete Item
router.delete('/item/:id', authenticateToken, async (req, res) => {
    try {
        const result = await dbAsync.run(
            'DELETE FROM items WHERE id = ? AND user_id = ?',
            [req.params.id, req.user.id]
        );
        if (result.changes === 0) return res.status(404).json({ error: 'Item not found' });
        res.json({ message: 'Item deleted' });
    } catch (err) {
        console.error('[Delete Item Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Reserve Item
router.post('/reserve/:itemId', authenticateToken, async (req, res) => {
    const itemId = parseInt(req.params.itemId);

    try {
        const item = await dbAsync.get(
            'SELECT user_id, reserved_by_id FROM items WHERE id = ?',
            [itemId]
        );
        if (!item) return res.status(404).json({ error: 'Item not found' });
        if (item.user_id === req.user.id) return res.status(400).json({ error: 'Cannot reserve your own item' });
        if (item.reserved_by_id) return res.status(400).json({ error: 'Item is already reserved' });

        await dbAsync.run(
            'UPDATE items SET reserved_by_id = ?, reserved_at = CURRENT_TIMESTAMP WHERE id = ?',
            [req.user.id, itemId]
        );

        await dbAsync.run(
            'INSERT INTO notifications (user_id, message) VALUES (?, ?)',
            [item.user_id, 'A friend just reserved one of your wishlist items! 🎁']
        );

        res.json({ message: 'Item reserved for 48 hours!' });
    } catch (err) {
        console.error('[Reserve Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Unreserve Item (cancel your own reservation)
router.post('/unreserve/:itemId', authenticateToken, async (req, res) => {
    const itemId = parseInt(req.params.itemId);
    try {
        const item = await dbAsync.get('SELECT reserved_by_id FROM items WHERE id = ?', [itemId]);
        if (!item) return res.status(404).json({ error: 'Item not found' });
        if (item.reserved_by_id !== req.user.id) return res.status(403).json({ error: 'You did not reserve this item' });

        await dbAsync.run('UPDATE items SET reserved_by_id = NULL, reserved_at = NULL WHERE id = ?', [itemId]);
        res.json({ message: 'Reservation cancelled' });
    } catch (err) {
        console.error('[Unreserve Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Privacy Setting
router.post('/privacy', authenticateToken, async (req, res) => {
    const { is_private } = req.body;
    try {
        await dbAsync.run(
            'UPDATE users SET is_private = ? WHERE id = ?',
            [is_private ? 1 : 0, req.user.id]
        );
        res.json({ message: 'Privacy updated' });
    } catch (err) {
        console.error('[Privacy Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
