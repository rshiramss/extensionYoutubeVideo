from youtube_transcript_api import YouTubeTranscriptApi
from urllib.parse import urlparse, parse_qs
import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure Gemini API securely
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
if not GEMINI_API_KEY:
    print("ERROR: No GEMINI_API_KEY found in environment variables!")
    print("Please create a .env file with: GEMINI_API_KEY=your_api_key_here")
    print("Get your API key from: https://makersuite.google.com/app/apikey")
    exit(1)

try:
    genai.configure(api_key=GEMINI_API_KEY)
    print("✅ Gemini API key configured successfully")
except Exception as e:
    print(f"❌ Error configuring Gemini API: {e}")
    print("Please check your API key is valid")
    exit(1)

def format_time(seconds):
    """
    Converts seconds to minutes:seconds format
    """
    minutes = int(seconds // 60)
    remaining_seconds = int(seconds % 60)
    return f"{minutes:02d}:{remaining_seconds:02d}"

def extract_video_id(url):
    """
    Extracts the video ID from a YouTube URL.
    """
    parsed_url = urlparse(url)
    if parsed_url.hostname == 'youtu.be':
        return parsed_url.path[1:]
    elif parsed_url.hostname in ('www.youtube.com', 'youtube.com'):
        if parsed_url.path == '/watch':
            return parse_qs(parsed_url.query)['v'][0]
        elif parsed_url.path.startswith('/embed/'):
            return parsed_url.path.split('/')[2]
    raise ValueError("Invalid YouTube URL")

def generate_summary_with_timestamps(transcript_entries):
    """
    Generates a summary with guaranteed timestamp associations using Gemini 1.5 Flash model
    """
    try:
        model = genai.GenerativeModel('gemini-1.5-flash')
        
        # First, create a structured format of the transcript with timestamps
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
        return f"Error generating summary: {e}"

def get_transcript_with_timestamps(video_url):
    """
    Retrieves the transcript with timestamps for a given YouTube video URL.
    """
    try:
        video_id = extract_video_id(video_url)
        print(f"Extracting transcript for video ID: {video_id}")
        
        # Try to get transcript with error handling
        try:
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
        except Exception as transcript_error:
            print(f"Error getting transcript: {transcript_error}")
            print("Make sure the video has captions available.")
            return
        
        print("\n=== Video Transcript with Timestamps ===\n")
        for entry in transcript:
            start_time = entry['start']
            text = entry['text']
            formatted_time = format_time(start_time)
            print(f"[{formatted_time}] {text}")
        
        # Generate and display summary with timestamps
        print("\n=== Key Points Summary with Timestamps ===\n")
        summary = generate_summary_with_timestamps(transcript)
        print(summary)
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Example usage
    print("YouTube Video Summarizer")
    print("=" * 40)
    video_url = input("Enter YouTube Video URL: ")
    get_transcript_with_timestamps(video_url)