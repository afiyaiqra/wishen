const express = require('express');
const { dbAsync } = require('../database');
const authenticateToken = require('../middleware/auth');
const router = express.Router();

// Get all todos for current user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const todos = await dbAsync.all(
            'SELECT * FROM todos WHERE user_id = ? ORDER BY is_done ASC, created_at DESC',
            [req.user.id]
        );
        res.json(todos);
    } catch (err) {
        console.error('[Todos Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add todo
router.post('/', authenticateToken, async (req, res) => {
    const { title, priority, due_date } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required' });

    try {
        const result = await dbAsync.run(
            'INSERT INTO todos (user_id, title, priority, due_date) VALUES (?, ?, ?, ?)',
            [req.user.id, title.trim(), priority || 'normal', due_date || null]
        );
        const todo = await dbAsync.get('SELECT * FROM todos WHERE id = ?', [result.lastID]);
        res.status(201).json(todo);
    } catch (err) {
        console.error('[Add Todo Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Toggle done
router.patch('/:id/toggle', authenticateToken, async (req, res) => {
    try {
        const todo = await dbAsync.get('SELECT * FROM todos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        if (!todo) return res.status(404).json({ error: 'Todo not found' });

        await dbAsync.run(
            'UPDATE todos SET is_done = ? WHERE id = ? AND user_id = ?',
            [todo.is_done ? 0 : 1, req.params.id, req.user.id]
        );
        res.json({ message: 'Toggled', is_done: !todo.is_done });
    } catch (err) {
        console.error('[Toggle Todo Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete todo
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        await dbAsync.run('DELETE FROM todos WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
        res.json({ message: 'Deleted' });
    } catch (err) {
        console.error('[Delete Todo Error]', err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
