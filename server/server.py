from flask import Flask, request, jsonify
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import google.generativeai as genai
import os
from dotenv import load_dotenv
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure port
PORT = 8000

app = Flask(__name__)
# Configure CORS to allow extensions to access the API
CORS(app, resources={r"/*": {"origins": "*"}})

# Load environment variables
load_dotenv()

# Configure Gemini API
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    GEMINI_API_KEY = "AIzaSyAmNU0u0GdMkZggJ7PUxho1gJUpIXgPC4E"
    logger.warning("Using hardcoded API key - consider moving to .env file for security")

genai.configure(api_key=GEMINI_API_KEY)

def format_time(seconds):
    minutes = int(seconds // 60)
    remaining_seconds = int(seconds % 60)
    return f"{minutes:02d}:{remaining_seconds:02d}"

def generate_summary_with_timestamps(transcript_entries):
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # Create a structured format of the transcript with timestamps
        formatted_transcript = []
        for entry in transcript_entries:
            timestamp = format_time(entry['start'])
            text = entry['text']
            formatted_transcript.append(f"[{timestamp}] {text}")
        
        transcript_text = "\n".join(formatted_transcript)
        
        prompt = f"""Analyze this video transcript and create a structured summary. For each key point:
1. Identify the most relevant timestamp
2. Extract the main point
3. Format as: "Timestamp: [MM:SS] - Key Point: [point]"

Transcript:
{transcript_text}

Please provide a summary with 5-7 key points, each with its timestamp. Format exactly as shown above.
Focus on main topics, important statements, and significant transitions in the video.
"""
        
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        logger.error(f"Error generating summary: {str(e)}")
        raise

@app.route('/')
def test():
    return jsonify({"status": "ok", "message": "YouTube Summarizer Server is running"})

@app.route('/summarize', methods=['POST'])
def summarize():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
            
        video_id = data.get('videoId')
        if not video_id:
            return jsonify({'error': 'No video ID provided'}), 400
        
        logger.info(f"Processing video ID: {video_id}")
        
        try:
            # First try to get available transcripts to see what's available
            transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
            available_languages = []
            manual_transcripts = []
            auto_transcripts = []
            
            for transcript_info in transcript_list:
                available_languages.append(transcript_info.language_code)
                if transcript_info.is_generated:
                    auto_transcripts.append(transcript_info.language_code)
                else:
                    manual_transcripts.append(transcript_info.language_code)
            
            logger.info(f"Available transcripts for video {video_id}: {available_languages}")
            logger.info(f"Manual transcripts: {manual_transcripts}")
            logger.info(f"Auto-generated transcripts: {auto_transcripts}")
            
            # Try to get transcript in order of preference
            transcript = None
            used_language = None
            
            # First try manual English transcripts
            for lang in ['en', 'en-US', 'en-GB']:
                if lang in manual_transcripts:
                    try:
                        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=[lang])
                        used_language = lang
                        logger.info(f"Using manual transcript in: {lang}")
                        break
                    except Exception as e:
                        logger.warning(f"Failed to get manual transcript in {lang}: {e}")
            
            # Then try auto-generated English transcripts
            if not transcript:
                for lang in ['en', 'en-US', 'en-GB']:
                    if lang in auto_transcripts:
                        try:
                            transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=[lang])
                            used_language = lang
                            logger.info(f"Using auto-generated transcript in: {lang}")
                            break
                        except Exception as e:
                            logger.warning(f"Failed to get auto-generated transcript in {lang}: {e}")
            
            # Finally try any available transcript
            if not transcript and available_languages:
                for lang in available_languages:
                    try:
                        transcript = YouTubeTranscriptApi.get_transcript(video_id, languages=[lang])
                        used_language = lang
                        logger.info(f"Using transcript in: {lang}")
                        break
                    except Exception as e:
                        logger.warning(f"Failed to get transcript in {lang}: {e}")
            
            if not transcript:
                logger.error(f"Failed to retrieve any transcript despite available languages: {available_languages}")
                return jsonify({'error': 'No usable transcript found for this video'}), 400
                
            logger.info(f"Successfully retrieved transcript for video {video_id} in language {used_language}")
        except TranscriptsDisabled:
            return jsonify({'error': 'Transcripts are disabled for this video'}), 400
        except NoTranscriptFound:
            return jsonify({'error': 'No transcript found for this video'}), 400
        except Exception as e:
            error_msg = str(e)
            if "no element found" in error_msg.lower():
                return jsonify({'error': 'This video does not have captions available or captions are corrupted'}), 400
            logger.error(f"Error getting transcript: {error_msg}")
            return jsonify({'error': f'Error getting transcript: {error_msg}'}), 500
        
        # Generate summary
        try:
            summary = generate_summary_with_timestamps(transcript)
            logger.info(f"Successfully generated summary for video {video_id}")
            
            if not summary or summary.strip() == '':
                logger.error("Generated summary is empty")
                return jsonify({'error': 'Generated summary is empty'}), 500
                
            return jsonify({'summary': summary})
        except Exception as e:
            logger.error(f"Error generating summary: {str(e)}")
            return jsonify({'error': f'Error generating summary: {str(e)}'}), 500
    
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info(f"Starting YouTube Summarizer server on port {PORT}...")
    logger.info("This server provides video summarization only")
    app.run(host='0.0.0.0', port=PORT, debug=True)