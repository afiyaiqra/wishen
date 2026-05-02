const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

require('./database');
require('./services/cron');

const authRoutes     = require('./routes/auth');
const friendsRoutes  = require('./routes/friends');
const wishlistRoutes = require('./routes/wishlist');
const messagesRoutes = require('./routes/messages');
const todosRoutes    = require('./routes/todos');

const app = express();

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ limit: '20mb', extended: true }));
app.use(express.static(path.join(__dirname, '..')));

app.use('/api/auth',     authRoutes);
app.use('/api/friends',  friendsRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/todos',    todosRoutes);

app.get('/api/health', (req, res) => res.json({ status: 'OK', message: 'Wishen backend is running!' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`\n🌸 Wishen running at http://localhost:${PORT}\n`);
});
