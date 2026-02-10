#!/bin/bash
echo "Starting Video Workflow Server..."
echo ""
echo "Installing Python dependencies if needed..."
pip install -r requirements.txt || pip3 install -r requirements.txt
echo ""
echo "Starting server on http://127.0.0.1:8000"
echo "ComfyUI should be running on http://127.0.0.1:8001"
echo ""
python video_workflow_server.py || python3 video_workflow_server.py