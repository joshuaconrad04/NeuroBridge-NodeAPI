const multer = require('multer');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const fs = require('fs');
const FormData = require('form-data'); 
const axios = require('axios');
const { OpenAI } = require('openai');

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

//Configure OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// Configure AssemblyAI
// Initialize axios client with base configuration
const assemblyAI = axios.create({
    baseURL: 'https://api.assemblyai.com/v2',
    headers: {
        authorization: process.env.ASSEMBLY_AI_API_KEY,
    },
    timeout: 30000 // 30 second timeout
});

const waitForTranscription = async (transcriptId, maxRetries = 30) => {
    let attempts = 0;
    while (attempts < maxRetries) {
        const { data } = await assemblyAI.get(`/transcript/${transcriptId}`);
        
        if (data.status === 'completed') {
            return data;
        }
        
        if (data.status === 'error') {
            throw new Error(`Transcription failed: ${data.error}`);
        }

        // Wait 2 seconds before next attempt
        await new Promise(resolve => setTimeout(resolve, 2000));
        attempts++;
    }
    throw new Error('Transcription timeout');
};

const processAudioSummary = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No audio file provided'
            });
        }
    
        console.log('Audio file received: ' + req.file.path);
        const audioFilePath = req.file.path;

        // Check if the file exists
        if (!fs.existsSync(audioFilePath)) {
            console.error('File does not exist:', audioFilePath);
            return res.status(500).json({
                success: false,
                message: 'File not found on server'
            });
        }

        console.log('Here is the size of the file that was passed in ', req.file.size);

        // 1. First, transcribe the audio using AssemblyAI
        const formData = new FormData();
        formData.append('file', fs.createReadStream(req.file.path));

        // Upload the file
        const uploadResponse = await assemblyAI.post('/upload', formData, {
            headers: {
                ...formData.getHeaders(),
            }
        });

        // Start transcription
        const transcriptionResponse = await assemblyAI.post('/transcript', {
            audio_url: uploadResponse.data.upload_url,
            language_detection: true
        });

        // Wait for transcription to complete
        const transcript = await waitForTranscription(transcriptionResponse.data.id);


        // 2. Then, use GPT to extract key tasks from the transcript
        if (transcript.text.length < 5) {
            return res.status(400).json({
                success: false,
                message: 'Transcript is too short'
            });
        }

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