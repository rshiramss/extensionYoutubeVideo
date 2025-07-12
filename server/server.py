from flask import Flask, request, jsonify
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi, TranscriptsDisabled, NoTranscriptFound
import google.generativeai as genai
import os
import sqlite3
from datetime import datetime
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

# Configure Gemini API with better error handling
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    logger.error("="*60)
    logger.error("CRITICAL: No GEMINI_API_KEY found!")
    logger.error("Please follow these steps:")
    logger.error("1. Get a free API key from: https://makersuite.google.com/app/apikey")
    logger.error("2. Create a .env file in the server/ directory")
    logger.error("3. Add this line: GEMINI_API_KEY=your_actual_api_key_here")
    logger.error("4. Restart the server")
    logger.error("="*60)
    exit(1)

try:
    genai.configure(api_key=GEMINI_API_KEY)
    # Test the API key by trying to create a model
    test_model = genai.GenerativeModel('gemini-1.5-flash')
    logger.info("✅ Gemini API key configured successfully")
except Exception as e:
    logger.error("="*60)
    logger.error(f"CRITICAL: Invalid Gemini API key! Error: {e}")
    logger.error("Please check your GEMINI_API_KEY in the .env file")
    logger.error("Get a new key from: https://makersuite.google.com/app/apikey")
    logger.error("="*60)
    exit(1)

# Database setup for notes and user management
DB_FILE = 'youtube_extension_notes.db'

def init_database():
    """Initialize the database with users, videos, and notes tables"""
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()
    
    # Create users table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_generated_user_id TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create videos table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            video_id TEXT UNIQUE NOT NULL,
            title TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Create notes table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            video_id TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
    ''')
    
    # Create watched_videos table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS watched_videos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            video_id TEXT NOT NULL,
            watched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id),
            UNIQUE(user_id, video_id)
        )
    ''')
    
    conn.commit()
    conn.close()
    logger.info("Database initialized successfully")

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
    return jsonify({
        "status": "ok", 
        "message": "YouTube Summarizer Server is running",
        "features": ["video_summarization", "user_notes", "watch_history"],
        "api_key_status": "configured" if GEMINI_API_KEY else "missing"
    })

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

@app.route('/get_or_create_user', methods=['POST'])
def get_or_create_user():
    try:
        data = request.get_json()
        if not data or 'client_generated_user_id' not in data:
            return jsonify({'error': 'client_generated_user_id is required'}), 400
        
        client_generated_user_id = data['client_generated_user_id']
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute('SELECT id FROM users WHERE client_generated_user_id = ?', (client_generated_user_id,))
        user = cursor.fetchone()
        
        if user:
            user_id = user[0]
            logger.info(f"Found existing user with ID: {user_id}")
        else:
            # Create new user
            cursor.execute('INSERT INTO users (client_generated_user_id) VALUES (?)', (client_generated_user_id,))
            user_id = cursor.lastrowid
            logger.info(f"Created new user with ID: {user_id}")
        
        conn.commit()
        conn.close()
        
        return jsonify({'user_id': user_id}), 200
    except Exception as e:
        logger.error(f"Error in get_or_create_user: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/users/<int:user_id>/notes', methods=['POST'])
def save_note(user_id):
    try:
        data = request.get_json()
        if not data or 'video_id' not in data or 'content' not in data:
            return jsonify({'error': 'video_id and content are required'}), 400
        
        video_id = data['video_id']
        content = data['content']
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Verify user exists
        cursor.execute('SELECT id FROM users WHERE id = ?', (user_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'User not found'}), 404
        
        # Insert note
        cursor.execute('''
            INSERT INTO notes (user_id, video_id, content) 
            VALUES (?, ?, ?)
        ''', (user_id, video_id, content))
        
        note_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
        logger.info(f"Saved note {note_id} for user {user_id}, video {video_id}")
        return jsonify({'note_id': note_id}), 201
    except Exception as e:
        logger.error(f"Error saving note: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/users/<int:user_id>/notes_by_video/<video_id>', methods=['GET'])
def get_notes_by_video(user_id, video_id):
    try:
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT id, content, created_at, updated_at 
            FROM notes 
            WHERE user_id = ? AND video_id = ?
            ORDER BY created_at DESC
        ''', (user_id, video_id))
        
        notes = []
        for row in cursor.fetchall():
            notes.append({
                'id': row[0],
                'content': row[1],
                'created_at': row[2],
                'updated_at': row[3]
            })
        
        conn.close()
        return jsonify(notes), 200
    except Exception as e:
        logger.error(f"Error getting notes: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/users/<int:user_id>/watched_videos', methods=['POST'])
def log_watched_video(user_id):
    try:
        data = request.get_json()
        if not data or 'video_id' not in data:
            return jsonify({'error': 'video_id is required'}), 400
        
        video_id = data['video_id']
        
        conn = sqlite3.connect(DB_FILE)
        cursor = conn.cursor()
        
        # Insert or update watched video record
        cursor.execute('''
            INSERT OR REPLACE INTO watched_videos (user_id, video_id, watched_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        ''', (user_id, video_id))
        
        conn.commit()
        conn.close()
        
        logger.info(f"Logged watched video {video_id} for user {user_id}")
        return jsonify({'status': 'success'}), 200
    except Exception as e:
        logger.error(f"Error logging watched video: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    logger.info("="*60)
    logger.info("🚀 Starting YouTube Summarizer Server")
    logger.info("="*60)
    
    # Initialize database
    init_database()
    
    logger.info(f"📡 Server starting on port {PORT}...")
    logger.info("📊 Features: Video summarization, User notes, Watch history")
    logger.info("🔑 Gemini API: Configured and tested")
    logger.info("="*60)
    
    app.run(host='0.0.0.0', port=PORT, debug=True)