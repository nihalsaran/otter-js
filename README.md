# Otter.ai API

Production-ready JavaScript/Node.js API wrapper for [Otter.ai](https://otter.ai).

## 🚀 Quick Start

### Installation

```bash
npm install
```

### Configuration

1. Copy the environment template:
```bash
cp .env.example .env
```

2. Update `.env` with your configuration:
```env
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
```

### Start the Server

```bash
# Production
npm start

# Development
npm run dev
```

The API will be available at `http://localhost:3000`.

## 📋 API Endpoints

### Authentication

**Login**
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "your_otter_username",
  "password": "your_otter_password"
}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "sess_abc123...",
  "user": {
    "userid": "user_id_here"
  },
  "expiresIn": 86400000
}
```

**Logout**
```http
POST /api/auth/logout
Content-Type: application/json
session-id: sess_abc123...

{
  "sessionId": "sess_abc123..."
}
```

### Main Endpoints

**Get All Speech IDs**
```http
GET /api/speech-ids
session-id: sess_abc123...
```

**Response:**
```json
{
  "total_count": 10,
  "speech_ids": [
    {
      "id": "speech_id_1",
      "title": "Meeting Notes",
      "created_at": "2025-01-01T00:00:00Z",
      "duration": 1800,
      "source": "owned"
    }
  ]
}
```

**Get Speech Transcript**
```http
GET /api/transcript/:speechId
session-id: sess_abc123...
```

**Response:**
```json
{
  "speech_id": "speech_id_1",
  "title": "Meeting Notes",
  "duration": 1800,
  "created_at": "2025-01-01T00:00:00Z",
  "transcript_text": "Full transcript text here...",
  "speakers": ["Speaker 1", "Speaker 2"],
  "structured_transcript": null
}
```

### Utility Endpoints

**Health Check**
```http
GET /health
```

**Root Information**
```http
GET /
```

## 🔒 Security Features

- **Rate Limiting**: 100 requests per 15 minutes (configurable)
- **Authentication Rate Limiting**: 5 login attempts per 15 minutes  
- **Helmet Security**: Security headers and CSP
- **CORS Protection**: Configurable origin restrictions
- **Session Management**: Secure session IDs with automatic cleanup
- **Input Validation**: Request size limits and input sanitization

## 🌍 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `3000` | Server port |
| `LOG_LEVEL` | `info` | Logging level |
| `API_RATE_LIMIT` | `100` | Requests per 15min window |
| `ALLOWED_ORIGINS` | `*` | CORS allowed origins (comma-separated) |

## 🚀 Deployment

### Vercel (Recommended)

The project is pre-configured for Vercel deployment:

```bash
vercel deploy
```

### Docker

Create a `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### PM2 (Production Server)

```bash
npm install -g pm2
pm2 start server.js --name "otter-api"
```

## 📚 Error Handling

The API returns structured error responses:

```json
{
  "error": "Error Type",
  "message": "Human readable error message"
}
```

Common HTTP status codes:
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (invalid session/credentials)
- `404`: Not Found (resource doesn't exist)
- `429`: Too Many Requests (rate limit exceeded)
- `500`: Internal Server Error

## 🔧 Development

### Project Structure

```
├── server.js          # Main server file
├── otterai.js         # Otter.ai API client
├── package.json       # Dependencies and scripts  
├── .env.example       # Environment template
├── vercel.json        # Vercel deployment config
└── README.md          # This file
```

### Core Dependencies

- **express**: Web framework
- **axios**: HTTP client for Otter.ai API
- **helmet**: Security middleware
- **cors**: Cross-origin resource sharing
- **express-rate-limit**: Rate limiting
- **morgan**: HTTP request logging
- **dotenv**: Environment variable loading

## 📄 License

MIT License - see LICENSE file for details.

## ⚠️ Important Notes

1. **Credentials**: This API acts as a proxy to Otter.ai. You need valid Otter.ai credentials.

2. **Rate Limits**: Both this API and Otter.ai have rate limits. Monitor usage in production.

3. **Session Security**: Sessions are stored in memory. For multi-instance deployments, consider Redis or database session storage.

4. **HTTPS**: Always use HTTPS in production for credential security.

5. **Monitoring**: Implement proper logging and monitoring for production use.
    }
}
```

## APIs

### User

#### Login
```javascript
const response = await otter.login(username, password);
```

#### Get User Information
```javascript
const userInfo = await otter.getUser();
```

### Speeches

#### Get All Speeches
```javascript
// Get all speeches (default parameters)
const speeches = await otter.getSpeeches();

// With custom parameters
const speeches = await otter.getSpeeches(
    folder = 0,      // folder ID
    pageSize = 45,   // number of results per page
    source = "owned" // source type
);
```

#### Get Single Speech
```javascript
const speech = await otter.getSpeech(speechId);
```

#### Search Within Speech
```javascript
const results = await otter.querySpeech(
    query = "search term",
    speechId = "speech_id", 
    size = 500  // max results
);
```

#### Upload Speech
```javascript
const result = await otter.uploadSpeech(
    fileName = "path/to/audio.mp4",
    contentType = "audio/mp4"
);
```

#### Download Speech
```javascript
const result = await otter.downloadSpeech(
    speechId = "speech_id",
    name = "custom_filename",           // optional
    fileFormat = "txt,pdf,mp3,docx,srt" // formats to download
);
```

#### Delete Speech (Move to Trash)
```javascript
const result = await otter.moveToTrashBin(speechId);
```

### Speakers

#### Get All Speakers
```javascript
const speakers = await otter.getSpeakers();
```

#### Create Speaker
```javascript
const result = await otter.createSpeaker("Speaker Name");
```

### Folders

#### Get All Folders
```javascript
const folders = await otter.getFolders();
```

### Groups

#### List Groups
```javascript
const groups = await otter.listGroups();
```

### Notifications

#### Get Notification Settings
```javascript
const settings = await otter.getNotificationSettings();
```

## Exceptions

The library includes a custom exception class:

```javascript
const { OtterAIException } = require('./otterai');

try {
    const result = await otter.getSpeech('invalid_id');
} catch (error) {
    if (error instanceof OtterAIException) {
        console.log('OtterAI specific error:', error.message);
    } else {
        console.log('General error:', error.message);
    }
}
```

## Examples

### Basic Usage

```javascript
const { OtterAI, OtterAIException } = require('./otterai');

async function example() {
    const otter = new OtterAI();
    
    try {
        // Login
        await otter.login('your_email@example.com', 'your_password');
        
        // Get speeches
        const speeches = await otter.getSpeeches();
        console.log(`Found ${speeches.data.speeches.length} speeches`);
        
        // Get speech details
        if (speeches.data.speeches.length > 0) {
            const firstSpeech = speeches.data.speeches[0];
            const details = await otter.getSpeech(firstSpeech.otid);
            console.log('Speech details:', details);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

example();
```

### Advanced Usage

See `advanced_example.js` for more comprehensive examples including:
- File uploads
- Downloads with different formats
- Speaker management
- Speech search and querying

### Running Examples

1. Install dependencies:
   ```bash
   npm install
   ```

2. Update credentials in the example files

3. Run basic example:
   ```bash
   node example_usage.js
   ```

4. Run advanced example:
   ```bash
   node advanced_example.js
   ```

## Dependencies

- **axios**: HTTP client for making API requests
- **form-data**: Multipart form data for file uploads
- **fast-xml-parser**: XML parsing for S3 upload responses

## Requirements

- Node.js 14.0.0 or higher
- Valid Otter.ai account credentials

## License

MIT License

## Contributing

This is a port of the original Python library. Contributions are welcome for:
- Bug fixes
- Feature improvements
- Additional API endpoints
- Better error handling
- Tests

## Notes

- The `speechStart()` and `stopSpeech()` methods are not yet implemented as they require WebSocket functionality
- File uploads are handled using Node.js streams for better memory efficiency
- All HTTP requests include proper timeout handling
- Cookie management is handled automatically after login

## API Response Format

All API methods return responses in the following format:

```javascript
{
    status: 200,           // HTTP status code
    data: {               // Response data
        // ... API response content
    }
}
```
