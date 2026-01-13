from app.config import Config

print("MODEL_PATH from Config:", Config.MODEL_PATH)
print("Type:", type(Config.MODEL_PATH))
print("Repr:", repr(Config.MODEL_PATH))

import os
print("\nChecking paths:")
print("models/deepfake_audio_detector.h5 exists:", os.path.exists("models/deepfake_audio_detector.h5"))
print("c:/Audionyx/backend/models/deepfake_audio_detector.h5 exists:", os.path.exists("c:/Audionyx/backend/models/deepfake_audio_detector.h5"))
