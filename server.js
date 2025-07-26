const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
require('dotenv').config();

const { OtterAI, OtterAIException } = require('./otterai');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.API_RATE_LIMIT || 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to all requests
app.use(limiter);

// More strict rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 auth requests per windowMs
    message: {
        error: 'Too many authentication attempts',
        message: 'Please try again later.'
    }
});

// Enhanced security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

// CORS configuration
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : true,
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Request logging
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body parsing middleware with limits
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Remove the demo HTML endpoint for production
if (NODE_ENV !== 'production') {
    app.get('/', (req, res) => {
        res.json({
            name: 'Otter.ai API',
            version: '1.0.0',
            status: 'running',
            endpoints: {
                login: 'POST /api/auth/login',
                speechIds: 'GET /api/speech-ids',
                transcript: 'GET /api/transcript/:speechId',
                logout: 'POST /api/auth/logout',
                health: 'GET /health'
            }
        });
    });
} else {
    app.get('/', (req, res) => {
        res.json({
            name: 'Otter.ai API',
            version: '1.0.0',
            status: 'running'
        });
    });
}

// Enhanced session management with cleanup
const sessions = new Map();
const SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

// Session cleanup function
const cleanupExpiredSessions = () => {
    const now = Date.now();
    for (const [sessionId, sessionData] of sessions.entries()) {
        if (now - sessionData.timestamp > SESSION_TIMEOUT) {
            sessions.delete(sessionId);
            console.log(`Cleaned up expired session: ${sessionId}`);
        }
    }
};

// Run cleanup every hour
setInterval(cleanupExpiredSessions, 60 * 60 * 1000);

// Helper function to get authenticated OtterAI instance
const getOtterInstance = (sessionId) => {
    const sessionData = sessions.get(sessionId);
    if (!sessionData) {
        throw new Error('Session not found or expired. Please login again.');
    }
    
    // Check if session is expired
    if (Date.now() - sessionData.timestamp > SESSION_TIMEOUT) {
        sessions.delete(sessionId);
        throw new Error('Session expired. Please login again.');
    }
    
    // Update timestamp for active sessions
    sessionData.timestamp = Date.now();
    
    return sessionData.otter;
};

// Generate secure session ID
const generateSessionId = () => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    const hash = Buffer.from(`${timestamp}_${random}`).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
    return `sess_${hash}`;
};

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Authentication endpoint
app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                error: 'Validation Error',
                message: 'Username and password are required' 
            });
        }

        // Basic input validation
        if (username.length > 200 || password.length > 200) {
            return res.status(400).json({
                error: 'Validation Error',
                message: 'Username or password too long'
            });
        }

        console.log(`Authentication attempt for user: ${username}`);

        const otter = new OtterAI();
        const loginResponse = await otter.login(username, password);

        if (loginResponse && loginResponse.status === 200) {
            // Generate secure session ID
            const sessionId = generateSessionId();
            
            // Store session with timestamp
            sessions.set(sessionId, {
                otter: otter,
                timestamp: Date.now(),
                userId: otter.userid,
                username: username
            });

            const response = {
                success: true,
                sessionId: sessionId,
                user: {
                    userid: otter.userid,
                    ...loginResponse.data
                },
                expiresIn: SESSION_TIMEOUT
            };

            console.log(`Login successful for user: ${username}, session: ${sessionId}`);
            res.json(response);
        } else {
            console.log(`Login failed for user: ${username}:`, loginResponse);
            res.status(401).json({
                error: 'Authentication Failed',
                message: 'Invalid username or password'
            });
        }
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            error: 'Authentication Error',
            message: NODE_ENV === 'production' ? 'Authentication service unavailable' : error.message
        });
    }
});

// MAIN ENDPOINT 1: Get speech IDs of all speeches
app.get('/api/speech-ids', async (req, res) => {
    try {
        const sessionId = req.headers['session-id'];
        
        if (!sessionId) {
            return res.status(401).json({ 
                error: 'Session ID required',
                message: 'Please provide session-id in headers' 
            });
        }
        
        const otter = getOtterInstance(sessionId);
        
        console.log('Fetching all speeches from all sources...');
        
        // Get all speeches from all sources and extract just the IDs
        const allSpeeches = await otter.getAllSpeechesFromAllSources();
        
        console.log('Raw response:', JSON.stringify(allSpeeches, null, 2));
        
        // Validate response structure
        if (!allSpeeches || !allSpeeches.data || !allSpeeches.data.all_speeches) {
            return res.status(500).json({ 
                error: 'Invalid response from Otter.ai',
                message: 'Expected speeches array not found in response'
            });
        }
        
        // Extract speech IDs and basic info
        const speechIds = allSpeeches.data.all_speeches.map(speech => ({
            id: speech.id,
            title: speech.title || 'Untitled',
            created_at: speech.created_at || null,
            duration: speech.duration || 0,
            source: speech.source || 'owned'
        }));
        
        const response = {
            total_count: allSpeeches.data.summary?.total_count || speechIds.length,
            speech_ids: speechIds
        };
        
        console.log('Sending response:', JSON.stringify(response, null, 2));
        
        res.json(response);
    } catch (error) {
        console.error('Error in /api/speech-ids:', error);
        res.status(500).json({ 
            error: 'Failed to get speech IDs',
            message: error.message || 'Unknown error occurred'
        });
    }
});

// MAIN ENDPOINT 2: Get speech transcript
app.get('/api/transcript/:speechId', async (req, res) => {
    try {
        const sessionId = req.headers['session-id'];
        
        if (!sessionId) {
            return res.status(401).json({ 
                error: 'Session ID required',
                message: 'Please provide session-id in headers' 
            });
        }
        
        const otter = getOtterInstance(sessionId);
        
        const { speechId } = req.params;
        
        if (!speechId) {
            return res.status(400).json({ error: 'Speech ID is required' });
        }
        
        console.log(`Fetching transcript for speech ID: ${speechId}`);
        
        // Get the full speech data including transcript
        const speech = await otter.getSpeech(speechId);
        
        console.log('Raw speech response:', JSON.stringify(speech, null, 2));
        
        // Validate response
        if (!speech) {
            return res.status(404).json({ 
                error: 'Speech not found',
                message: `No speech found with ID: ${speechId}`
            });
        }
        
        // Extract transcript information
        const transcript = {
            speech_id: speechId,
            title: speech.title || 'Untitled',
            duration: speech.duration || 0,
            created_at: speech.created_at || null,
            transcript_text: speech.transcript || '',
            speakers: speech.speakers || [],
            // Include structured transcript if available
            structured_transcript: speech.structured_transcript || null
        };
        
        console.log('Sending transcript response:', JSON.stringify(transcript, null, 2));
        
        res.json(transcript);
    } catch (error) {
        console.error(`Error in /api/transcript/${req.params.speechId}:`, error);
        res.status(500).json({ 
            error: 'Failed to get transcript',
            message: error.message || 'Unknown error occurred'
        });
    }
});

// Logout endpoint
app.post('/api/auth/logout', (req, res) => {
    try {
        const sessionId = req.headers['session-id'] || req.body.sessionId;
        
        if (sessionId && sessions.has(sessionId)) {
            const sessionData = sessions.get(sessionId);
            sessions.delete(sessionId);
            console.log(`Session logged out: ${sessionId} for user: ${sessionData.username}`);
        }
        
        res.json({ 
            success: true, 
            message: 'Logged out successfully' 
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            error: 'Logout Error',
            message: 'Failed to logout properly'
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        error: 'Something went wrong!',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested endpoint does not exist'
    });
});

// Start server (check for Vercel environment)
if (!process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`🚀 Otter.ai API Server running on port ${PORT}`);
        console.log(`📋 Available endpoints:`);
        console.log(`   POST /api/auth/login - Authenticate with Otter.ai`);
        console.log(`   GET  /api/speech-ids - Get all speech IDs`);
        console.log(`   GET  /api/transcript/:speechId - Get transcript for a speech`);
        console.log(`   POST /api/auth/logout - Logout`);
    });
}

module.exports = app;
