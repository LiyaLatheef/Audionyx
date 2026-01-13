"""
Inspect old model architecture
"""
import h5py
import json

model_path = r"c:\Audionyx\backend\models\deepfake_audio_detector.h5"

with h5py.File(model_path, 'r') as f:
    config_str = f.attrs.get('model_config')
    if isinstance(config_str, bytes):
        config_str = config_str.decode('utf-8')
    
    config = json.loads(config_str)
    
    print("MODEL ARCHITECTURE:")
    print("=" * 60)
    
    for i, layer in enumerate(config['config']['layers']):
        print(f"\nLayer {i}: {layer['class_name']}")
        if 'config' in layer:
            cfg = layer['config']
            if 'batch_shape' in cfg:
                print(f"  batch_shape: {cfg['batch_shape']}")
            if 'target_shape' in cfg:
                print(f"  target_shape: {cfg['target_shape']}")
            if 'filters' in cfg:
                print(f"  filters: {cfg['filters']}")
            if 'kernel_size' in cfg:
                print(f"  kernel_size: {cfg['kernel_size']}")
            if 'activation' in cfg:
                print(f"  activation: {cfg['activation']}")
            if 'pool_size' in cfg:
                print(f"  pool_size: {cfg['pool_size']}")
            if 'units' in cfg:
                print(f"  units: {cfg['units']}")
            if 'rate' in cfg:
                print(f"  rate: {cfg['rate']}")
            if 'name' in cfg:
                print(f"  name: {cfg['name']}")
    
    print("\n" + "=" * 60)
    print("\nWEIGHT LAYERS:")
    if 'model_weights' in f:
        weight_layer_names = [n.decode('utf8') if hasattr(n, 'decode') else n 
                             for n in f['model_weights'].attrs['layer_names']]
        for name in weight_layer_names:
            g = f['model_weights'][name]
            weight_names = [n.decode('utf8') if hasattr(n, 'decode') else n 
                           for n in g.attrs['weight_names']]
            shapes = []
            for wname in weight_names:
                shapes.append(f[f'model_weights/{name}/{wname}'].shape)
            print(f"{name}: {shapes}")
