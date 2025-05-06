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
PORT = 3003

app = Flask(__name__)
# Configure CORS to allow extensions to access the API
CORS(app, resources={r"/*": {"origins": "*"}})

# Load environment variables
load_dotenv()

# Configure Gemini API
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
genai.configure(api_key="AIzaSyAmNU0u0GdMkZggJ7PUxho1gJUpIXgPC4E")

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
    return jsonify({"status": "ok", "message": "Server is running"})

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
            # Get transcript
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
            logger.info(f"Successfully retrieved transcript for video {video_id}")
        except TranscriptsDisabled:
            return jsonify({'error': 'Transcripts are disabled for this video'}), 400
        except NoTranscriptFound:
            return jsonify({'error': 'No transcript found for this video'}), 400
        except Exception as e:
            logger.error(f"Error getting transcript: {str(e)}")
            return jsonify({'error': f'Error getting transcript: {str(e)}'}), 500
        
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

if __name__ == '__main__':
    # Simple port setup
    port = 8000
    logger.info(f"Starting server on port {port}...")
    app.run(host='0.0.0.0', port=port, debug=True)