from youtube_transcript_api import YouTubeTranscriptApi
from urllib.parse import urlparse, parse_qs
import google.generativeai as genai
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure Gemini API
GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
genai.configure(api_key="AIzaSyBxxnamB82ERJPkQaRURmxTn7JMKSUs16M")

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
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        
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

# Example usage
video_url = input("Enter YouTube Video URL: ")
get_transcript_with_timestamps(video_url)
