const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');

class OtterAIException extends Error {
    constructor(message) {
        super(message);
        this.name = 'OtterAIException';
    }
}

class OtterAI {
    static API_BASE_URL = 'https://otter.ai/forward/api/v1/';
    static S3_BASE_URL = 'https://s3.us-west-2.amazonaws.com/';

    constructor() {
        this.session = axios.create({
            timeout: 30000,
            validateStatus: () => true, // Don't throw on HTTP error status codes
            withCredentials: true // Enable cookies
        });
        this.userid = null;
        this.cookies = {};
    }

    _isUseridInvalid() {
        return !this.userid;
    }

    _handleResponse(response, data = null) {
        if (data) {
            return { status: response.status, data: data };
        }
        try {
            return { status: response.status, data: response.data };
        } catch (error) {
            return { status: response.status, data: {} };
        }
    }

    _extractCookies(response) {
        const cookies = {};
        const setCookieHeader = response.headers['set-cookie'];
        if (setCookieHeader) {
            setCookieHeader.forEach(cookie => {
                const [nameValue] = cookie.split(';');
                const [name, value] = nameValue.split('=');
                if (name && value) {
                    cookies[name.trim()] = value.trim();
                }
            });
        }
        return cookies;
    }

    _setCookieHeader() {
        if (Object.keys(this.cookies).length > 0) {
            const cookieString = Object.entries(this.cookies)
                .map(([name, value]) => `${name}=${value}`)
                .join('; ');
            this.session.defaults.headers.common['Cookie'] = cookieString;
        }
    }

    async login(username, password) {
        // API URL
        const authUrl = OtterAI.API_BASE_URL + 'login';
        // Query Parameters
        const params = { username: username };
        
        try {
            // GET with basic authentication
            const response = await this.session.get(authUrl, {
                params: params,
                auth: {
                    username: username,
                    password: password
                }
            });

            // Check status
            if (response.status !== 200) {
                return this._handleResponse(response);
            }

            // Set userid & cookies
            this.userid = response.data.userid;
            this.cookies = this._extractCookies(response);
            this._setCookieHeader(); // Set cookies for subsequent requests

            return this._handleResponse(response);
        } catch (error) {
            throw new OtterAIException(`Login failed: ${error.message}`);
        }
    }

    async getUser() {
        // API URL
        const userUrl = OtterAI.API_BASE_URL + 'user';
        
        try {
            // GET
            const response = await this.session.get(userUrl);
            return this._handleResponse(response);
        } catch (error) {
            throw new OtterAIException(`Get user failed: ${error.message}`);
        }
    }

    async getSpeakers() {
        // API URL
        const speakersUrl = OtterAI.API_BASE_URL + 'speakers';
        
        if (this._isUseridInvalid()) {
            throw new OtterAIException('userid is invalid');
        }

        // Query Parameters
        const params = { userid: this.userid };
        
        try {
            // GET
            const response = await this.session.get(speakersUrl, { params });
            return this._handleResponse(response);
        } catch (error) {
            throw new OtterAIException(`Get speakers failed: ${error.message}`);
        }
    }

    async getSpeeches(folder = 0, pageSize = 45, source = "owned") {
        // API URL
        const speechesUrl = OtterAI.API_BASE_URL + 'speeches';
        
        if (this._isUseridInvalid()) {
            throw new OtterAIException('userid is invalid');
        }

        // Query Parameters
        const params = {
            userid: this.userid,
            folder: folder,
            page_size: pageSize,
            source: source
        };
        
        try {
            // GET
            const response = await this.session.get(speechesUrl, { params });
            return this._handleResponse(response);
        } catch (error) {
            throw new OtterAIException(`Get speeches failed: ${error.message}`);
        }
    }

    async getAllSpeeches(folder = 0, source = "owned", maxSpeeches = 1000) {
        // Get all speeches by making multiple requests with different page sizes
        // Note: Otter.ai API doesn't seem to support offset-based pagination
        // So we'll try to get the maximum number of speeches in a single request
        
        if (this._isUseridInvalid()) {
            throw new OtterAIException('userid is invalid');
        }

        try {
            console.log(`Getting all ${source} speeches from folder ${folder}...`);
            
            // First, try with a large page size to get as many as possible
            const largePageSize = Math.min(maxSpeeches, 200); // Some APIs have limits
            const response = await this.getSpeeches(folder, largePageSize, source);
            
            if (response.status !== 200 || !response.data?.speeches) {
                throw new OtterAIException(`Failed to get speeches: ${response.status}`);
            }

            const speeches = response.data.speeches;
            console.log(`Retrieved ${speeches.length} speeches`);

            // Check if there might be more speeches by testing with different methods
            if (speeches.length === largePageSize) {
                console.log(`⚠️  Retrieved maximum page size (${largePageSize}). There might be more speeches.`);
                console.log(`   The Otter.ai API may have pagination limitations.`);
            }

            return {
                status: 200,
                data: {
                    status: 'OK',
                    speeches: speeches,
                    total_count: speeches.length,
                    note: speeches.length === largePageSize ? 
                        'Max page size reached - there may be more speeches' : 
                        'All available speeches retrieved'
                }
            };

        } catch (error) {
            throw new OtterAIException(`Get all speeches failed: ${error.message}`);
        }
    }

    async getAllSpeechesFromAllSources(folder = 0, maxPerSource = 500) {
        // Get speeches from all available sources
        if (this._isUseridInvalid()) {
            throw new OtterAIException('userid is invalid');
        }

        const sources = ["owned", "shared"];
        const allSpeeches = {
            owned: [],
            shared: [],
            total: 0
        };

        try {
            for (const source of sources) {
                console.log(`\n🔄 Getting all ${source} speeches...`);
                try {
                    const result = await this.getAllSpeeches(folder, source, maxPerSource);
                    if (result.data?.speeches) {
                        allSpeeches[source] = result.data.speeches;
                        allSpeeches.total += result.data.speeches.length;
                        console.log(`✅ Retrieved ${result.data.speeches.length} ${source} speeches`);
                    }
                } catch (error) {
                    console.log(`⚠️  Failed to get ${source} speeches: ${error.message}`);
                    allSpeeches[source] = [];
                }
            }

            return {
                status: 200,
                data: {
                    status: 'OK',
                    speeches_by_source: allSpeeches,
                    all_speeches: [...allSpeeches.owned, ...allSpeeches.shared],
                    summary: {
                        owned_count: allSpeeches.owned.length,
                        shared_count: allSpeeches.shared.length,
                        total_count: allSpeeches.total
                    }
                }
            };

        } catch (error) {
            throw new OtterAIException(`Get all speeches from all sources failed: ${error.message}`);
        }
    }

    async getSpeech(speechId) {
        // API URL
        const speechUrl = OtterAI.API_BASE_URL + 'speech';
        
        if (this._isUseridInvalid()) {
            throw new OtterAIException('userid is invalid');
        }

        // Query Params
        const params = { userid: this.userid, otid: speechId };
        
        try {
            // GET
            const response = await this.session.get(speechUrl, { params });
            return this._handleResponse(response);
        } catch (error) {
            throw new OtterAIException(`Get speech failed: ${error.message}`);
        }
    }

    async querySpeech(query, speechId, size = 500) {
        // API URL
        const querySpeechUrl = OtterAI.API_BASE_URL + 'advanced_search';
        
        // Query Params
        const params = { query: query, size: size, otid: speechId };
        
        try {
            // GET
            const response = await this.session.get(querySpeechUrl, { params });
            return this._handleResponse(response);
        } catch (error) {
            throw new OtterAIException(`Query speech failed: ${error.message}`);
        }
    }

    async uploadSpeech(fileName, contentType = 'audio/mp4') {
        // API URLs
        const speechUploadParamsUrl = OtterAI.API_BASE_URL + 'speech_upload_params';
        const speechUploadProdUrl = OtterAI.S3_BASE_URL + 'speech-upload-prod';
        const finishSpeechUpload = OtterAI.API_BASE_URL + 'finish_speech_upload';

        if (this._isUseridInvalid()) {
            throw new OtterAIException('userid is invalid');
        }

        try {
            // First grab upload params (aws data)
            const params = { userid: this.userid };
            const response = await this.session.get(speechUploadParamsUrl, { params });

            if (response.status !== 200) {
                return this._handleResponse(response);
            }

            const responseJson = response.data;
            const paramsData = responseJson.data;

            // Send options (precondition) request
            const optionsResponse = await this.session.options(speechUploadProdUrl, {
                headers: {
                    'Accept': '*/*',
                    'Connection': 'keep-alive',
                    'Origin': 'https://otter.ai',
                    'Referer': 'https://otter.ai/',
                    'Access-Control-Request-Method': 'POST'
                }
            });

            if (optionsResponse.status !== 200) {
                return this._handleResponse(optionsResponse);
            }

            // Post file to bucket
            const formData = new FormData();
            
            // Add all params data to form
            paramsData.success_action_status = String(paramsData.success_action_status);
            delete paramsData.form_action;
            
            Object.keys(paramsData).forEach(key => {
                formData.append(key, paramsData[key]);
            });
            
            // Add file
            const fileStream = fs.createReadStream(fileName);
            formData.append('file', fileStream, {
                filename: path.basename(fileName),
                contentType: contentType
            });

            // POST file to S3
            const uploadResponse = await axios.post(speechUploadProdUrl, formData, {
                headers: formData.getHeaders(),
                validateStatus: () => true
            });

            if (uploadResponse.status !== 201) {
                return this._handleResponse(uploadResponse);
            }

            // Parse XML response
            const parser = new XMLParser();
            const xmlData = parser.parse(uploadResponse.data);
            
            // Extract location, bucket, and key from XML
            const postResponse = xmlData.PostResponse;
            const location = postResponse.Location;
            const bucket = postResponse.Bucket;
            const key = postResponse.Key;

            // Call finish API
            const finishParams = {
                bucket: bucket,
                key: key,
                language: 'en',
                country: 'us',
                userid: this.userid
            };
            
            const finishResponse = await this.session.get(finishSpeechUpload, { params: finishParams });
            return this._handleResponse(finishResponse);

        } catch (error) {
            throw new OtterAIException(`Upload speech failed: ${error.message}`);
        }
    }

    async downloadSpeech(speechId, name = null, fileFormat = "txt,pdf,mp3,docx,srt") {
        // API URL
        const downloadSpeechUrl = OtterAI.API_BASE_URL + 'bulk_export';
        
        if (this._isUseridInvalid()) {
            throw new OtterAIException('userid is invalid');
        }

        // Query Params
        const params = { userid: this.userid };
        
        // POST data
        const data = {
            formats: fileFormat,
            speech_otid_list: [speechId]
        };
        
        const headers = {
            'x-csrftoken': this.cookies.csrftoken,
            'referer': 'https://otter.ai/'
        };

        try {
            const response = await this.session.post(downloadSpeechUrl, data, {
                params: params,
                headers: headers,
                responseType: 'arraybuffer'
            });

            // Filename
            const filename = (name || speechId) + "." + (fileFormat.includes(",") ? "zip" : fileFormat);
            
            if (response.status === 200) {
                fs.writeFileSync(filename, response.data);
                return this._handleResponse(response, { filename: filename });
            } else {
                throw new OtterAIException(`Got response status ${response.status} when attempting to download ${speechId}`);
            }
        } catch (error) {
            throw new OtterAIException(`Download speech failed: ${error.message}`);
        }
    }

    async moveToTrashBin(speechId) {
        // API URL
        const moveToTrashBinUrl = OtterAI.API_BASE_URL + 'move_to_trash_bin';
        
        if (this._isUseridInvalid()) {
            throw new OtterAIException('userid is invalid');
        }

        // Query Params
        const params = { userid: this.userid };
        
        // POST data
        const data = { otid: speechId };
        const headers = { 'x-csrftoken': this.cookies.csrftoken };

        try {
            const response = await this.session.post(moveToTrashBinUrl, data, {
                params: params,
                headers: headers
            });
            return this._handleResponse(response);
        } catch (error) {
            throw new OtterAIException(`Move to trash bin failed: ${error.message}`);
        }
    }

    async createSpeaker(speakerName) {
        // API URL
        const createSpeakerUrl = OtterAI.API_BASE_URL + 'create_speaker';
        
        if (this._isUseridInvalid()) {
            throw new OtterAIException('userid is invalid');
        }

        // Query Parameters
        const params = { userid: this.userid };
        
        // POST data
        const data = { speaker_name: speakerName };
        const headers = { 'x-csrftoken': this.cookies.csrftoken };

        try {
            const response = await this.session.post(createSpeakerUrl, data, {
                params: params,
                headers: headers
            });
            return this._handleResponse(response);
        } catch (error) {
            throw new OtterAIException(`Create speaker failed: ${error.message}`);
        }
    }

    async getNotificationSettings() {
        // API URL
        const notificationSettingsUrl = OtterAI.API_BASE_URL + 'get_notification_settings';
        
        try {
            const response = await this.session.get(notificationSettingsUrl);
            return this._handleResponse(response);
        } catch (error) {
            throw new OtterAIException(`Get notification settings failed: ${error.message}`);
        }
    }

    async listGroups() {
        // API URL
        const listGroupsUrl = OtterAI.API_BASE_URL + 'list_groups';
        
        if (this._isUseridInvalid()) {
            throw new OtterAIException('userid is invalid');
        }

        // Query Parameters
        const params = { userid: this.userid };
        
        try {
            const response = await this.session.get(listGroupsUrl, { params });
            return this._handleResponse(response);
        } catch (error) {
            throw new OtterAIException(`List groups failed: ${error.message}`);
        }
    }

    async getFolders() {
        // API URL
        const foldersUrl = OtterAI.API_BASE_URL + 'folders';
        
        if (this._isUseridInvalid()) {
            throw new OtterAIException('userid is invalid');
        }

        // Query Parameters
        const params = { userid: this.userid };
        
        try {
            const response = await this.session.get(foldersUrl, { params });
            return this._handleResponse(response);
        } catch (error) {
            throw new OtterAIException(`Get folders failed: ${error.message}`);
        }
    }

    async speechStart() {
        // API URL
        const speechStartUrl = OtterAI.API_BASE_URL + 'speech_start';
        // TODO: In the browser a websocket session is opened
        // wss://ws.aisense.com/api/v2/client/speech?token=ey...
        // The speech_start endpoint returns the JWT token
        throw new OtterAIException('Speech start not implemented yet');
    }

    async stopSpeech() {
        // API URL
        const speechFinishUrl = OtterAI.API_BASE_URL + 'speech_finish';
        // TODO: Implementation needed
        throw new OtterAIException('Stop speech not implemented yet');
    }
}

module.exports = { OtterAI, OtterAIException };
