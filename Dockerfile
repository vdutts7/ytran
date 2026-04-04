FROM python:3.12-slim

WORKDIR /app

# Install yt-dlp and ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/server.py .

# Copy cookies if present (optional — enables YouTube bot bypass)
COPY backend/cookie* ./

EXPOSE 8080

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8080"]
