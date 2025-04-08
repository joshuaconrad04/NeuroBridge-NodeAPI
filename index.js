const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const db = require('./config/database');
require('dotenv').config();
const { uploadMiddleware, summarizePDF } = require('./controllers/summarizeController');
const { audioMiddleware, processAudioSummary } = require('./controllers/audioController');
const { getSessions, createSession } = require('./controllers/sessionController');

const app = express();

// Middleware
app.use(cors({
    origin: 'http://localhost:5173', // Default Vite frontend port
    credentials: true
}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));



//home endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Welcome to the Divergence API'
    });
});





// Test endpoint
app.get('/api/test', (req, res) => {
    db.query('SELECT 1 + 1 AS solution', (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Database connection failed',
                error: err.message
            });
        }
        res.json({
            success: true,
            message: 'Backend is running and database is connected!',
            data: results[0]
        });
    });
});

// PDF summarization endpoint
app.post('/api/summarize', uploadMiddleware, summarizePDF);

// Audio summarization endpoint
app.post('/api/audiosummary', audioMiddleware, processAudioSummary);

// Sessions endpoint
app.get('/api/sessions', getSessions);
app.post('/api/sessions', createSession);

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Something broke!',
        error: err.message
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
