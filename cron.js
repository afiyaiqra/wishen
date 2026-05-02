const cron = require('node-cron');
const { dbAsync } = require('../database');

// Run every hour
cron.schedule('0 * * * *', async () => {
    console.log('[Cron Job] Checking for expired reservations...');
    try {
        // Expiry rule: 48 hours
        // SQLite datetime('now', '-48 hours')
        const query = `
            UPDATE items 
            SET reserved_by_id = NULL, reserved_at = NULL 
            WHERE reserved_at IS NOT NULL 
            AND reserved_at <= datetime('now', '-48 hours')
        `;
        
        const result = await dbAsync.run(query, []);
        if (result.changes > 0) {
            console.log(`[Cron Job] Removed ${result.changes} expired reservations.`);
            // NOTE: We could also trigger a notification here if desired.
        }
    } catch (err) {
        console.error('[Cron Job Error]', err);
    }
});

console.log('Cron service initialized.');
