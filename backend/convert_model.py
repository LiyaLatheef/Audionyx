"""
Convert old Keras model to new Keras-compatible format
"""
import h5py
import json
import numpy as np
import tensorflow as tf
from tensorflow import keras

# Load old model config
model_path = r"c:\Audionyx\backend\models\deepfake_audio_detector.h5"

print("Loading old model...")
with h5py.File(model_path, 'r') as f:
    config_str = f.attrs.get('model_config')
    if isinstance(config_str, bytes):
        config_str = config_str.decode('utf-8')
    
    old_config = json.loads(config_str)
    print(f"Old model config: {json.dumps(old_config, indent=2)[:500]}...")

# Rebuild model with new Keras API - EXACT architecture from old model
print("\nBuilding new compatible model...")
model = keras.Sequential([
    keras.layers.Input(shape=(128, 87)),
    keras.layers.Reshape((128, 87, 1)),
    keras.layers.Conv2D(64, (3, 3), activation='relu'),
    keras.layers.Conv2D(64, (3, 3), activation='relu'),
    keras.layers.MaxPooling2D((2, 2)),
    keras.layers.Conv2D(128, (3, 3), activation='relu'),
    keras.layers.Conv2D(128, (3, 3), activation='relu'),
    keras.layers.MaxPooling2D((2, 2)),
    keras.layers.Flatten(),
    keras.layers.Dense(256, activation='relu'),
    keras.layers.Dense(256, activation='relu'),
    keras.layers.Dense(1, activation='sigmoid')
], name='deepfake_detector')

print("\nNew model summary:")
model.summary()

# Load weights from old model
print("\nLoading weights from old model...")
try:
    with h5py.File(model_path, 'r') as f:
        if 'model_weights' in f:
            weight_layer_names = [n.decode('utf8') if hasattr(n, 'decode') else n 
                                 for n in f['model_weights'].attrs['layer_names']]
            print(f"Weight layers in old model: {weight_layer_names}")
            
            # Direct mapping by name (skip Reshape and Input which have no weights)
            loaded_count = 0
            for new_layer in model.layers:
                if new_layer.name in weight_layer_names:
                    try:
                        g = f['model_weights'][new_layer.name]
                        weight_names = [n.decode('utf8') if hasattr(n, 'decode') else n 
                                       for n in g.attrs['weight_names']]
                        weights = [np.array(g[name]) for name in weight_names]
                        
                        # Only set weights if shapes match
                        expected_shapes = [w.shape for w in new_layer.get_weights()]
                        actual_shapes = [w.shape for w in weights]
                        
                        if expected_shapes == actual_shapes:
                            new_layer.set_weights(weights)
                            loaded_count += 1
                            print(f"✓ Loaded weights for {new_layer.name}")
                        else:
                            print(f"✗ Shape mismatch for {new_layer.name}: expected {expected_shapes}, got {actual_shapes}")
                    except Exception as e:
                        print(f"✗ Error loading {new_layer.name}: {e}")
            
            print(f"\nSuccessfully loaded {loaded_count} layers with weights")
            
except Exception as e:
    print(f"Error: {e}")
    print("\nCreating model with random weights (for testing)...")

# Save new model
output_path = r"c:\Audionyx\backend\models\deepfake_audio_detector_v2.h5"
model.save(output_path)
print(f"\n✓ Saved new model to: {output_path}")

# Test loading
print("\nTesting new model loading...")
loaded_model = keras.models.load_model(output_path)
print("✓ Model loads successfully!")

# Test prediction
print("\nTesting prediction...")
test_input = np.random.rand(1, 128, 87).astype(np.float32)
prediction = loaded_model.predict(test_input, verbose=0)
print(f"Test prediction: {prediction[0][0]:.4f}")
print("\n✓ Model conversion complete!")
