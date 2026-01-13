"""
Audio Processing Utilities
"""
import base64
import io
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

def convert_webm_to_wav(webm_bytes):
    """
    Convert WebM audio to WAV format
    Requires ffmpeg to be installed
    """
    try:
        # Load audio from bytes
        audio = AudioSegment.from_file(
            io.BytesIO(webm_bytes),
            format="webm"
        )
        
        # Convert to mono and set sample rate
        audio = audio.set_channels(1)
        audio = audio.set_frame_rate(16000)
        
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
