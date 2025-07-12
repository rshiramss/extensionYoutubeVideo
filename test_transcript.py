#!/usr/bin/env python3

from youtube_transcript_api import YouTubeTranscriptApi
import sys

def test_transcript(video_id):
    print(f"Testing transcript for video ID: {video_id}")
    
    try:
        # First, list available transcripts
        print("Listing available transcripts...")
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        print("Available transcripts:")
        for transcript in transcript_list:
            print(f"  - {transcript.language_code} ({'auto-generated' if transcript.is_generated else 'manual'})")
        
        # Try to get any transcript
        print("\nTrying to fetch transcript...")
        transcript = YouTubeTranscriptApi.get_transcript(video_id)
        print(f"Success! Got {len(transcript)} transcript entries")
        print("First few entries:")
        for i, entry in enumerate(transcript[:3]):
            print(f"  {i+1}. [{entry['start']:.1f}s] {entry['text']}")
            
    except Exception as e:
        print(f"Error: {e}")
        print(f"Error type: {type(e).__name__}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        video_id = sys.argv[1]
    else:
        # Test with a known working video (TED talk)
        video_id = "dQw4w9WgXcQ"  # Rick Roll - has captions
        
    test_transcript(video_id)