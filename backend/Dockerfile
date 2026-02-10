# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PORT=7860
ENV MODEL_PATH=/app/models/deepfake_audio_detector_v2.h5

# Set work directory
WORKDIR /app

# Install system dependencies (required for librosa/soundfile)
RUN apt-get update && apt-get install -y \
    libsndfile1 \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create a non-root user and switch to it (security best practice)
RUN useradd -m -u 1000 user
USER user

# Expose the port (Hugging Face Spaces uses 7860 by default)
EXPOSE 7860

# Run with Gunicorn (using eventlet for SocketIO support)
CMD ["gunicorn", "-k", "eventlet", "-w", "1", "--bind", "0.0.0.0:7860", "run:app"]
