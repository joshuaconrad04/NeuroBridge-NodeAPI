const multer = require('multer');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const FormData = require('form-data'); 
const axios = require('axios');
const { OpenAI } = require('openai');


const audioMiddleware = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        console.log('Incoming file type:', file.mimetype); // Debug log
        const allowedMimes = [
            'audio/webm',
            'audio/ogg',
            'audio/mp4',
            'audio/mpeg',
            'audio/mp3',
            'audio/wav',
            'audio/flac',
            'audio/x-m4a',
            'audio/aac'
        ];
        
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            console.log('Rejected file type:', file.mimetype); // Debug log
            cb(new Error(`Unsupported audio format: ${file.mimetype}`), false);
        }
    },
    limits: {
        fileSize: 250 * 1024 * 1024 // 250MB limit
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
        if (!req.file.buffer) {
            return res.status(400).json({
                success: false,
                message: 'No audio file provided'
            });
        }

        // 1. First, transcribe the audio using AssemblyAI
        const formData = new FormData();
        formData.append('file', req.file.buffer);

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