const db = require('../config/database');

const getSessions = (req, res) => {
    const query = `
        SELECT 
            id,
            duration,
            isCompleted
        FROM session
        ORDER BY id DESC`; // Most recent sessions first

    db.query(query, (err, results) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error fetching sessions',
                error: err.message
            });
        }

        // Transform boolean value for consistency in API response
        const formattedResults = results.map(session => ({
            id: session.id,
            duration: session.duration,
            isCompleted: Boolean(session.isCompleted) // Ensures true/false instead of 1/0
        }));

        res.json({
            success: true,
            message: 'Sessions retrieved successfully',
            data: formattedResults
        });
    });
};

const createSession = (req, res) => {
    const { duration, isCompleted } = req.body;
    
    // Basic validation
    if (!duration) {
        return res.status(400).json({
            success: false,
            message: 'Duration is required'
        });
    }

    const query = `
        INSERT INTO session (duration, isCompleted)
        VALUES (?, ?)`;

    db.query(query, [duration, isCompleted || false], (err, result) => {
        if (err) {
            return res.status(500).json({
                success: false,
                message: 'Error creating session',
                error: err.message
            });
        }

        res.status(201).json({
            success: true,
            message: 'Session created successfully',
            data: {
                id: result.insertId,
                duration,
                isCompleted: Boolean(isCompleted)
            }
        });
    });
};

module.exports = {
    getSessions,
    createSession
}; 