#!/bin/bash
# Script to test the YouTube summarizer server fix

echo "Testing YouTube Summarizer Server Fix..."
echo "---------------------------------------"
echo "1. Shutting down any existing server processes on port 8000..."
lsof -ti:8000 | xargs kill -9 2>/dev/null

echo "2. Starting fixed server version in background..."
python server_fixed.py > server_test.log 2>&1 &
SERVER_PID=$!
echo "   Server started with PID: $SERVER_PID"

echo "3. Waiting 3 seconds for server to initialize..."
sleep 3

echo "4. Testing server connection..."
curl -s http://localhost:8000/ | jq || echo "Failed to connect to server"

echo "5. Testing a video summarization (using a video with captions)..."
echo "   Sending request for video dQw4w9WgXcQ (which has captions)..."
curl -s -X POST -H "Content-Type: application/json" -d '{"videoId":"dQw4w9WgXcQ"}' http://localhost:8000/summarize | jq

echo "6. Cleaning up - shutting down test server..."
kill $SERVER_PID

echo "7. Done! Check server_test.log for detailed server output."
echo "   To use the fixed server permanently, rename server_fixed.py to server.py"
echo "   Command: mv server_fixed.py server.py"
