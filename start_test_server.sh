#!/bin/bash
echo "Starting Mock ComfyUI Server..."
echo ""
echo "Installing Python dependencies if needed..."
pip install -r requirements.txt || pip3 install -r requirements.txt
echo ""
echo "Starting server on http://127.0.0.1:8001"
python test_server.py || python3 test_server.py