"""
Audio Processing Utilities
"""
import base64
import io
import shutil
from pydub import AudioSegment
import logging

logger = logging.getLogger(__name__)

def base64_to_bytes(base64_string):
    """Convert base64 string to bytes"""
    try:
        # Remove data URL prefix if present
        if ',' in base64_string:
            base64_string = base64_string.split(',')[1]
        
        return base64.b64decode(base64_string)
    except Exception as e:
        logger.error(f"Error decoding base64: {str(e)}")
        raise

def convert_webm_to_wav(webm_bytes, target_sample_rate=22050):
    """
    Convert WebM audio to WAV format
    Requires ffmpeg to be installed
    """
    try:
        # Ensure ffmpeg is available. Without it, pydub cannot decode WebM/Opus.
        if not shutil.which("ffmpeg") and not shutil.which("ffmpeg.exe"):
            raise RuntimeError(
                "FFmpeg was not found on PATH. Install FFmpeg and restart the backend so WebM/Opus audio can be converted to WAV. "
                "(Example: install 'ffmpeg' and ensure 'ffmpeg.exe' is in PATH.)"
            )

        # Load audio from bytes
        audio = AudioSegment.from_file(
            io.BytesIO(webm_bytes),
            format="webm"
        )
        
        # Convert to mono and set sample rate
        audio = audio.set_channels(1)
        audio = audio.set_frame_rate(int(target_sample_rate))
        
        # Export to WAV bytes
        wav_io = io.BytesIO()
        audio.export(wav_io, format="wav")
        wav_io.seek(0)
        
        return wav_io.read()
        
    except Exception as e:
        logger.error(f"Error converting audio format: {str(e)}")
        raise

def validate_audio_chunk(audio_bytes, min_size=200):
    """Validate audio chunk size and format"""
    if not audio_bytes:
        return False, "Audio chunk is empty"
    
    if len(audio_bytes) < min_size:
        return False, f"Audio chunk too small: {len(audio_bytes)} bytes (min: {min_size} bytes)"
    
    return True, "Valid"
