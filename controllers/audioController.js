const multer = require('multer');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const { OpenAI } = require('openai');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '..', 'uploads', 'audio');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for audio uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        if (file.mimetype === 'audio/mpeg') {
            cb(null, Date.now() + path.extname(file.originalname) + '.mp3');
        } else {
            cb(null, Date.now() + path.extname(file.originalname));
        }
    }
});

const audioMiddleware = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'audio/mpeg' || file.mimetype === 'audio/mp3') {
            cb(null, true);
        } else {
            cb(new Error('Only MP3 files are allowed!'), false);
        }
    },
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
}).single('audio');

// Configure OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const processAudioSummary = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No audio file provided'
            });
        }
        
        console.log('Audio file received: ' + req.file.path);

       // console.log('Here is the size of the file that was passed in ', req.file.size);
        // Check if the file exists
        if (!fs.existsSync(req.file.path)) {
            console.error('File does not exist:', req.file.path);
            return res.status(500).json({
                success: false,
                message: 'File not found on server'
            });
        }

        console.log('Here is the size of the file that was passed in ', req.file.size);

        // 1. First, transcribe the audio using OpenAI's Whisper API
        const transcript = await openai.audio.transcriptions.create({
            file: fs.createReadStream(req.file.path),
            model: "gpt-4o-mini-transcribe"
        });

        console.log('Full transcript result:', transcript);
        console.log('Transcript:', transcript.text);

        // 2. Then, use GPT to extract key tasks from the transcript
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: "You're are a helpful assistant that extracts key tasks and action items from meeting transcripts. Please provide a clear, bullet-pointed list of tasks."
                },
                {
                    role: "user",
                    content: `Please extract the key tasks and action items from this transcript: ${transcript.text}`
                }
            ],
        });

        // 3. Clean up the uploaded file
        fs.unlink(req.file.path, (err) => {
            if (err) console.error('Error deleting file:', err);
        });

        // 4. Send the response
        console.log('Audio summary:', completion.choices[0].message.content);
        res.json({
            success: true,
            transcript: transcript.text,
            tasks: completion.choices[0].message.content
        });

    } catch (error) {
        // Clean up file if it exists
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Error deleting file:', err);
            });
        }

        console.error('Error processing audio:', error.message, error.stack);
        res.status(500).json({
            success: false,
            message: 'Error processing audio file',
            error: error.message
        });
    }
};

module.exports = {
    audioMiddleware,
    processAudioSummary
}; 