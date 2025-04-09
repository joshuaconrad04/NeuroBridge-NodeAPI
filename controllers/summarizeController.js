const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

console.log('Current directory:', __dirname);
console.log('Looking for .env at:', path.resolve(__dirname, '../../.env'));
console.log('API Key exists:', !!process.env.OPENAI_API_KEY);
const multer = require('multer');
const { OpenAI } = require('openai');
const pdfParse = require('pdf-parse');

// Configure multer for PDF uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  }
});

// Configure OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware for handling PDF upload
const uploadMiddleware = upload.single('file');

//
// Main summarize controller function
const summarizePDF = async (req, res) => {
  try {
    // Check if file was provided and log file details
    console.log('req.file', req.file);
    if (!req.file) {
      console.log('No file in request');
      return res.status(400).json({
        success: false,
        message: 'No PDF file provided',
        error: 'MISSING_FILE'
      });
    }

    console.log('File received:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bufferLength: req.file.buffer.length
    });

    // Parse PDF to text
    let pdfText;
    try {
      console.log('Attempting to parse PDF...');
      const pdfData = await pdfParse(req.file.buffer);
      console.log('PDF parsed successfully');
      pdfText = pdfData.text;
    } catch (error) {
      console.error('PDF parsing error:', error);
      return res.status(400).json({
        success: false,
        message: 'Failed to parse PDF file',
        error: 'PDF_PARSE_ERROR',
        details: error.message
      });
    }

    // Check if PDF has content
    if (!pdfText.trim()) {
      return res.status(400).json({
        success: false,
        message: 'PDF appears to be empty',
        error: 'EMPTY_PDF'
      });
    }

    // Call OpenAI API for summarization
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "You are a helpful assistant that summarizes documents concisely."
          },
          {
            role: "user",
            content: `Please summarize the following text:\n\n${pdfText}`
          }
        ],
        max_tokens: 500
      });

      // Check if we got a response
      if (!completion.choices || completion.choices.length === 0) {
        throw new Error('No response from OpenAI');
      }

      const summary = completion.choices[0].message.content;
      console.log(summary);
      // Return successful response
      return res.status(200).json({
        success: true,
        message: 'PDF successfully summarized',
        data: {
          summary,
          originalLength: pdfText.length,
          summaryLength: summary.length
        }
      });

    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate summary',
        error: 'OPENAI_API_ERROR',
        details: error.message
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: 'INTERNAL_SERVER_ERROR',
      details: error.message
    });
  }
};

module.exports = {
  uploadMiddleware,
  summarizePDF
}; 