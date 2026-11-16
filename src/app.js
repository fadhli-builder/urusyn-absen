const express = require('express');
const pool = require('./db/pool');

const app = express();

app.get('/health', async (req, res) =>{
    try {
        await pool.query('SELECT 1');
        res.json({ ok: true, db: true});
    }catch(err) {
        res.status(500).json({ ok: false, db:false})
    }
});

module.exports = app;