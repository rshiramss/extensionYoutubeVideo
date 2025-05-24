from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import desc
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

# Configure Database
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///youtube_extension_notes.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)

# Load environment variables
load_dotenv()

# Configure Gemini API
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
genai.configure(api_key="AIzaSyAmNU0u0GdMkZggJ7PUxho1gJUpIXgPC4E")

# Define Models
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    client_generated_user_id = db.Column(db.String, unique=True, nullable=False)
    notes = db.relationship('Note', backref='user', lazy=True)
    watched_videos = db.relationship('WatchedVideo', backref='watcher', lazy=True)

class WatchedVideo(db.Model):
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    video_id = db.Column(db.String(255), nullable=False)
    video_title = db.Column(db.String(500), nullable=True)
    watched_at = db.Column(db.DateTime, nullable=False, default=datetime.datetime.utcnow)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

class Note(db.Model):
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)
    video_id = db.Column(db.String, nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)

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

@app.route('/get_or_create_user', methods=['POST'])
def get_or_create_user():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        client_generated_user_id = data.get('client_generated_user_id')
        if not client_generated_user_id:
            return jsonify({'error': 'client_generated_user_id is required.'}), 400

        user = User.query.filter_by(client_generated_user_id=client_generated_user_id).first()

        if user:
            return jsonify({"status": "success", "message": "User already exists.", "user_id": user.id}), 200
        else:
            try:
                new_user = User(client_generated_user_id=client_generated_user_id)
                db.session.add(new_user)
                db.session.commit()
                logger.info(f"Created new user with client_generated_user_id: {client_generated_user_id}, new_user_id: {new_user.id}")
                return jsonify({"status": "success", "message": "User created.", "user_id": new_user.id}), 201
            except Exception as e:
                db.session.rollback()
                logger.error(f"Error creating user: {str(e)}")
                return jsonify({'error': f'Error creating user: {str(e)}'}), 500
    
    except Exception as e:
        logger.error(f"Unexpected error in /get_or_create_user: {str(e)}")
        return jsonify({'error': str(e)}), 500

# CRUD Endpoints for Notes

# Create a new note
@app.route('/users/<int:user_db_id>/notes', methods=['POST'])
def create_note(user_db_id):
    try:
        user = User.query.get(user_db_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        video_id = data.get('video_id')
        content = data.get('content')

        if not video_id:
            return jsonify({'error': 'video_id is required'}), 400
        if not content:
            return jsonify({'error': 'content is required'}), 400

        try:
            new_note = Note(
                user_id=user_db_id,
                video_id=video_id,
                content=content
            )
            db.session.add(new_note)
            db.session.commit()
            logger.info(f"Created new note with id: {new_note.id} for user_id: {user_db_id}")
            return jsonify({
                'id': new_note.id,
                'video_id': new_note.video_id,
                'content': new_note.content,
                'created_at': new_note.created_at.isoformat(),
                'updated_at': new_note.updated_at.isoformat(),
                'user_id': new_note.user_id
            }), 201
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error creating note: {str(e)}")
            return jsonify({'error': f'Error creating note: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Unexpected error in create_note: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Get all notes for a user
@app.route('/users/<int:user_db_id>/notes', methods=['GET'])
def get_notes_for_user(user_db_id):
    try:
        user = User.query.get(user_db_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        notes = Note.query.filter_by(user_id=user_db_id).all()
        notes_data = [{
            'id': note.id,
            'video_id': note.video_id,
            'content': note.content,
            'created_at': note.created_at.isoformat(),
            'updated_at': note.updated_at.isoformat()
        } for note in notes]
        return jsonify(notes_data), 200
    except Exception as e:
        logger.error(f"Unexpected error in get_notes_for_user: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Get notes for a user by video_id
@app.route('/users/<int:user_db_id>/notes_by_video/<string:video_id>', methods=['GET'])
def get_notes_for_user_by_video(user_db_id, video_id):
    try:
        user = User.query.get(user_db_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        notes = Note.query.filter_by(user_id=user_db_id, video_id=video_id).all()
        notes_data = [{
            'id': note.id,
            'video_id': note.video_id,
            'content': note.content,
            'created_at': note.created_at.isoformat(),
            'updated_at': note.updated_at.isoformat()
        } for note in notes]
        return jsonify(notes_data), 200
    except Exception as e:
        logger.error(f"Unexpected error in get_notes_for_user_by_video: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Update an existing note
@app.route('/notes/<int:note_id>', methods=['PUT'])
def update_note(note_id):
    try:
        note = Note.query.get(note_id)
        if not note:
            return jsonify({'error': 'Note not found'}), 404

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        content = data.get('content')
        client_generated_user_id = data.get('client_generated_user_id')

        if not content:
            return jsonify({'error': 'content is required for update'}), 400
        if not client_generated_user_id:
            return jsonify({'error': 'client_generated_user_id is required for authorization'}), 400

        requesting_user = User.query.filter_by(client_generated_user_id=client_generated_user_id).first()
        if not requesting_user:
            return jsonify({'error': 'Requesting user not found'}), 403 # Or 401 if preferred for unknown user
        
        if note.user_id != requesting_user.id:
            return jsonify({'error': 'Forbidden: You do not own this note'}), 403

        try:
            note.content = content
            note.updated_at = datetime.datetime.utcnow()
            db.session.commit()
            logger.info(f"Updated note with id: {note.id}")
            return jsonify({
                'id': note.id,
                'video_id': note.video_id,
                'content': note.content,
                'created_at': note.created_at.isoformat(),
                'updated_at': note.updated_at.isoformat(),
                'user_id': note.user_id
            }), 200
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error updating note: {str(e)}")
            return jsonify({'error': f'Error updating note: {str(e)}'}), 500

    except Exception as e:
        logger.error(f"Unexpected error in update_note: {str(e)}")
        return jsonify({'error': str(e)}), 500

# Delete an existing note
@app.route('/notes/<int:note_id>', methods=['DELETE'])
def delete_note(note_id):
    try:
        note = Note.query.get(note_id)
        if not note:
            return jsonify({'error': 'Note not found'}), 404

        data = request.get_json()
        if not data: # Even for DELETE, we expect client_generated_user_id for auth
            return jsonify({'error': 'No data provided, client_generated_user_id is required for authorization'}), 400

        client_generated_user_id = data.get('client_generated_user_id')
        if not client_generated_user_id:
            return jsonify({'error': 'client_generated_user_id is required for authorization'}), 400

        requesting_user = User.query.filter_by(client_generated_user_id=client_generated_user_id).first()
        if not requesting_user:
             return jsonify({'error': 'Requesting user not found'}), 403 # Or 401

        if note.user_id != requesting_user.id:
            return jsonify({'error': 'Forbidden: You do not own this note'}), 403
        
        try:
            db.session.delete(note)
            db.session.commit()
            logger.info(f"Deleted note with id: {note_id}")
            return jsonify({'message': 'Note deleted successfully'}), 200 # Or 204 No Content
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error deleting note: {str(e)}")
            return jsonify({'error': f'Error deleting note: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Unexpected error in delete_note: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/users/<int:user_db_id>/watched_videos', methods=['POST'])
def add_watched_video(user_db_id):
    try:
        user = User.query.get(user_db_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400
        
        video_id = data.get('video_id')
        video_title = data.get('video_title') # Optional

        if not video_id:
            return jsonify({'error': 'video_id is required'}), 400

        # Duplicate Check
        five_minutes_ago = datetime.datetime.utcnow() - datetime.timedelta(minutes=5)
        recent_entry = WatchedVideo.query.filter_by(user_id=user_db_id, video_id=video_id)\
                                         .filter(WatchedVideo.watched_at > five_minutes_ago)\
                                         .order_by(desc(WatchedVideo.watched_at))\
                                         .first()
        
        if recent_entry:
            logger.info(f"Video {video_id} already logged recently for user {user_db_id}.")
            return jsonify({"message": "Video recently logged.", "video_id": video_id, "entry_id": recent_entry.id}), 200 # 208 also an option

        try:
            new_entry = WatchedVideo(
                user_id=user_db_id,
                video_id=video_id,
                video_title=video_title,
                watched_at=datetime.datetime.utcnow() # Explicitly set, though default is there
            )
            db.session.add(new_entry)
            db.session.commit()
            logger.info(f"Logged watched video: {video_id} for user: {user_db_id}, entry_id: {new_entry.id}")
            return jsonify({"message": "Video history logged.", "entry_id": new_entry.id}), 201
        except Exception as e:
            db.session.rollback()
            logger.error(f"Error logging watched video: {str(e)}")
            return jsonify({'error': f'Error logging watched video: {str(e)}'}), 500
            
    except Exception as e:
        logger.error(f"Unexpected error in add_watched_video: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/users/<int:user_db_id>/watched_videos', methods=['GET'])
def get_watched_videos(user_db_id):
    try:
        user = User.query.get(user_db_id)
        if not user:
            return jsonify({'error': 'User not found'}), 404

        watched_videos = WatchedVideo.query.filter_by(user_id=user_db_id)\
                                           .order_by(WatchedVideo.watched_at.desc())\
                                           .all()
        
        videos_data = [{
            'id': video.id,
            'video_id': video.video_id,
            'video_title': video.video_title,
            'watched_at': video.watched_at.isoformat()
        } for video in watched_videos]
        
        return jsonify(videos_data), 200
    except Exception as e:
        logger.error(f"Unexpected error in get_watched_videos: {str(e)}")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Simple port setup
    port = 8000
    logger.info(f"Starting server on port {port}...")
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0', port=port, debug=True)