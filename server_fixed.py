from flask import Flask, request, jsonify
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import google.generativeai as genai
import os
from dotenv import load_dotenv
import logging
import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure port
PORT = 8000

app = Flask(__name__)
# Configure CORS to allow extensions to access the API
CORS(app, resources={r"/*": {"origins": "*"}}, supports_credentials=True)

# Add CORS headers to all responses
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response.headers['Pragma'] = 'no-cache'
    response.headers['Expires'] = '0'
    return response

# Load environment variables
load_dotenv()

# Configure Gemini API
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    # If not in .env file, try the hardcoded key (not best practice but keeping for compatibility)
    GEMINI_API_KEY = "AIzaSyAmNU0u0GdMkZggJ7PUxho1gJUpIXgPC4E"
    logger.warning("Using hardcoded API key - consider moving to .env file for security")

try:
    genai.configure(api_key=GEMINI_API_KEY)
    logger.info("Gemini API configured successfully")
except Exception as e:
    logger.error(f"Failed to configure Gemini API: {str(e)}")

def format_time(seconds):
    minutes = int(seconds // 60)
    remaining_seconds = int(seconds % 60)
    return f"{minutes:02d}:{remaining_seconds:02d}"

def generate_summary_with_timestamps(transcript_entries):
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Create a structured format of the transcript with timestamps
        formatted_transcript = []
        
        # Debug the transcript entries type to help with debugging
        logger.info(f"Transcript entry type: {type(transcript_entries)}")
        if len(transcript_entries) > 0:
            logger.info(f"First transcript entry type: {type(transcript_entries[0])}")
        
        for entry in transcript_entries:
            try:
                # Handle different formats of transcript entries
                if isinstance(entry, dict):
                    # Standard dictionary format
                    timestamp = format_time(entry['start'])
                    text = entry['text']
                elif hasattr(entry, 'start') and hasattr(entry, 'text'):
                    # Object with attributes
                    timestamp = format_time(entry.start)
                    text = entry.text
                else:
                    # Try to convert to dictionary if it's a custom object
                    entry_dict = vars(entry) if hasattr(entry, '__dict__') else {}
                    timestamp = format_time(entry_dict.get('start', 0))
                    text = entry_dict.get('text', str(entry))
                    
                formatted_transcript.append(f"[{timestamp}] {text}")
            except Exception as entry_error:
                logger.error(f"Error processing transcript entry: {entry_error}")
                # Skip this entry but continue with others
                continue
        
        # Check if we have any formatted transcript content
        if not formatted_transcript:
            logger.error("No transcript content could be processed")
            raise ValueError("No transcript content could be processed")
            
        transcript_text = "\n".join(formatted_transcript)
        
        # Add additional logging for the transcript text length
        logger.info(f"Formatted transcript length: {len(transcript_text)} chars")
        
        prompt = f"""Analyze this video transcript and create a structured summary. For each key point:
1. Identify the most relevant timestamp
2. Extract the main point
3. Format as: "Timestamp: [MM:SS] - Key Point: [point]"

Transcript:
{transcript_text}

Please provide a summary with 5-7 key points, each with its timestamp. Format exactly as shown above.
Focus on main topics, important statements, and significant transitions in the video.
"""
        
        try:
            response = model.generate_content(prompt)
            logger.info("Summary generated successfully from Gemini API")
            return response.text
        except Exception as api_error:
            logger.error(f"Error from Gemini API: {api_error}")
            raise ValueError(f"Failed to generate summary via Gemini API: {api_error}")
    except Exception as e:
        logger.error(f"Error generating summary: {str(e)}")
        # Add more context to the error
        if "FetchedTranscriptSnippet" in str(e):
            logger.error("This error is likely due to a transcript format incompatibility")
            logger.error("Transcript format details:")
            try:
                logger.error(f"Transcript entries count: {len(transcript_entries)}")
                logger.error(f"First entry sample: {str(transcript_entries[0])[:100]}")
            except Exception as detail_error:
                logger.error(f"Could not log transcript details: {detail_error}")
        raise

@app.route('/')
def test():
    return jsonify({"status": "ok", "message": "Server is running"})

@app.route('/summarize', methods=['POST', 'OPTIONS'])
def summarize():
    # Handle CORS preflight requests
    if request.method == 'OPTIONS':
        response = jsonify({'status': 'ok'})
        return response
    
    try:
        # Log request information for debugging
        logger.info("-" * 50)
        logger.info("Request received to /summarize endpoint")
        logger.info(f"Content-Type: {request.content_type}")
        logger.info(f"Headers: {dict(request.headers)}")
        logger.info(f"Raw data: {request.data.decode('utf-8') if request.data else 'No data'}")
        
        # Try different methods to parse JSON data
        data = None
        
        try:
            data = request.get_json(silent=True)
            logger.info(f"Parsed JSON using get_json(): {data}")
        except Exception as e:
            logger.error(f"Error parsing JSON with get_json(): {e}")
        
        if not data and request.data:
            try:
                import json
                data = json.loads(request.data.decode('utf-8'))
                logger.info(f"Parsed JSON manually: {data}")
            except Exception as e:
                logger.error(f"Error parsing JSON manually: {e}")
        
        if not data:
            logger.error("No JSON data could be parsed from request")
            return jsonify({
                'error': 'No data provided', 
                'debug': {
                    'content_type': request.content_type,
                    'data_received': bool(request.data),
                    'data_length': len(request.data) if request.data else 0
                }
            }), 400
            
        video_id = data.get('videoId')
        if not video_id:
            logger.error("No videoId found in request JSON")
            return jsonify({'error': 'No video ID provided', 'data_received': data}), 400
        
        # Sanitize video ID to ensure we're using a valid format
        # YouTube IDs are typically 11 characters, removing any URL parameters or whitespace
        video_id = video_id.strip()
        if '?' in video_id:
            video_id = video_id.split('?')[0]
        if '&' in video_id:
            video_id = video_id.split('&')[0]
        if '/' in video_id:
            video_id = video_id.split('/')[-1]
            
        logger.info(f"Processing video ID (sanitized): {video_id}")
        
        # Get transcript
        transcript = None
        error_message = ""
        
        try:
            # First try standard method (usually auto-detected language)
            try:
                transcript = YouTubeTranscriptApi.get_transcript(video_id)
                logger.info(f"Successfully retrieved transcript for video {video_id}")
                
                # Log transcript format for debugging
                if transcript:
                    logger.info(f"Transcript type: {type(transcript)}")
                    logger.info(f"Transcript entry count: {len(transcript)}")
                    if len(transcript) > 0:
                        logger.info(f"First entry type: {type(transcript[0])}")
                        logger.info(f"First entry sample: {str(transcript[0])}")
            except Exception as e1:
                error_message = str(e1)
                logger.warning(f"Failed to get transcript with default language: {error_message}")
                
                # Try fallback methods
                transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
                
                # Try to find English transcript first
                try:
                    transcript = transcript_list.find_transcript(['en']).fetch()
                    logger.info(f"Found and retrieved English transcript for video {video_id}")
                except Exception as e_en:
                    logger.warning(f"English transcript not available: {str(e_en)}")
                    
                    # Try to get a list of all available languages
                    available_transcripts = []
                    try:
                        available_transcripts = list(transcript_list)
                        lang_codes = [t.language_code for t in available_transcripts]
                        logger.info(f"Available transcript languages: {lang_codes}")
                    except Exception as e_list:
                        logger.warning(f"Could not list available transcripts: {str(e_list)}")
                    
                    # Try to get any available transcript
                    first_transcript = None
                    
                    # Try manual transcripts first (usually better quality)
                    try:
                        first_transcript = next(iter(transcript_list._manually_created_transcripts.values()), None)
                    except Exception as e_manual:
                        logger.warning(f"Error accessing manual transcripts: {str(e_manual)}")
                    
                    # If no manual transcript, try auto-generated
                    if not first_transcript:
                        try:
                            first_transcript = next(iter(transcript_list._generated_transcripts.values()), None)
                        except Exception as e_auto:
                            logger.warning(f"Error accessing auto-generated transcripts: {str(e_auto)}")
                    
                    # Use the first available transcript if found
                    if first_transcript:
                        try:
                            transcript = first_transcript.fetch()
                            logger.info(f"Using available transcript in language: {first_transcript.language}")
                        except Exception as fetch_err:
                            logger.error(f"Error fetching transcript: {str(fetch_err)}")
                            raise fetch_err
                    else:
                        logger.error("No transcripts available for this video")
                        raise ValueError("No transcripts available for this video")
            
            # Standardize transcript format if necessary
            if transcript and len(transcript) > 0:
                # If transcript entries are not dictionaries, convert them
                if not isinstance(transcript[0], dict):
                    logger.info("Converting transcript to standard format")
                    try:
                        # For objects with text/start attributes
                        standardized = []
                        for entry in transcript:
                            if hasattr(entry, 'text') and hasattr(entry, 'start'):
                                standardized.append({'text': entry.text, 'start': entry.start})
                            else:
                                # Try to get attributes from object
                                entry_dict = vars(entry) if hasattr(entry, '__dict__') else {}
                                standardized.append({
                                    'text': entry_dict.get('text', str(entry)),
                                    'start': entry_dict.get('start', 0)
                                })
                        transcript = standardized
                    except Exception as convert_err:
                        logger.error(f"Error standardizing transcript format: {str(convert_err)}")
                
        except TranscriptsDisabled:
            return jsonify({'error': 'Transcripts are disabled for this video'}), 400
        except NoTranscriptFound:
            return jsonify({'error': 'No transcript found for this video'}), 400
        except Exception as e:
            logger.error(f"Error getting transcript: {str(e)}")
            return jsonify({'error': f'Error getting transcript: {str(e)}'}), 500
        
        # Verify transcript
        if not transcript:
            if "no element found" in error_message.lower():
                return jsonify({'error': 'No captions available for this video'}), 400
            elif "transcripts disabled" in error_message.lower():
                return jsonify({'error': 'Transcripts are disabled for this video'}), 400
            else:
                return jsonify({'error': f'Failed to retrieve transcript: {error_message}'}), 500
        
        # Verify transcript is not empty
        if len(transcript) == 0:
            return jsonify({'error': 'Retrieved transcript is empty'}), 400
        
        # Generate summary
        try:
            summary = generate_summary_with_timestamps(transcript)
            logger.info(f"Successfully generated summary for video {video_id}")
            
            # Debug summary output
            logger.info(f"Summary content (first 100 chars): {summary[:100]}...")
            
            if not summary or summary.strip() == '':
                logger.error("Generated summary is empty")
                return jsonify({'error': 'Generated summary is empty'}), 500
                
            return jsonify({'summary': summary, 'debug_info': {
                'timestamp': str(datetime.datetime.now()),
                'summary_length': len(summary),
                'transcript_length': len(str(transcript))
            }})
        except Exception as e:
            logger.error(f"Error generating summary: {str(e)}")
            return jsonify({'error': f'Error generating summary: {str(e)}'}), 500
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.errorhandler(500)
def handle_server_error(e):
    logger.error(f"Internal server error: {str(e)}")
    return jsonify({'error': f"Server error: {str(e)}"}), 500

@app.errorhandler(404)
def handle_not_found(e):
    logger.error(f"Not found: {str(e)}")
    return jsonify({'error': "Endpoint not found"}), 404

@app.errorhandler(Exception)
def handle_exception(e):
    logger.error(f"Unhandled exception: {str(e)}")
    return jsonify({'error': f"Unexpected error: {str(e)}"}), 500

if __name__ == '__main__':
    logger.info(f"Starting YouTube Summarizer server on port {PORT}...")
    logger.info(f"Access the API at http://localhost:{PORT}/ or http://127.0.0.1:{PORT}/")
    
    try:
        app.run(host='0.0.0.0', port=PORT, debug=True)
    except Exception as e:
        logger.error(f"Failed to start server: {str(e)}")
        print(f"ERROR: Could not start server on port {PORT}")
        print(f"Reason: {str(e)}")
        print("Try a different port by changing the PORT variable in server.py")
