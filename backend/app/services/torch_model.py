from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class TorchModelConfig:
    in_channels: int
    conv_channels: tuple[int, int, int]
    projection_in: int
    d_model: int
    nhead: int
    dim_feedforward: int
    num_layers: int


def _infer_config(state_dict: Mapping[str, object]) -> TorchModelConfig:
    # CNN
    w0 = state_dict["cnn.0.weight"]  # (C_out, C_in, kH, kW)
    w4 = state_dict["cnn.4.weight"]
    w8 = state_dict["cnn.8.weight"]
    in_channels = int(getattr(w0, "shape")[1])
    c1 = int(getattr(w0, "shape")[0])
    c2 = int(getattr(w4, "shape")[0])
    c3 = int(getattr(w8, "shape")[0])

    # Projection
    proj_w = state_dict["projection.weight"]  # (d_model, projection_in)
    d_model = int(getattr(proj_w, "shape")[0])
    projection_in = int(getattr(proj_w, "shape")[1])

    # Transformer
    in_proj_w = state_dict["transformer.layers.0.self_attn.in_proj_weight"]  # (3*d_model, d_model)
    d_model_attn = int(getattr(in_proj_w, "shape")[1])
    if d_model_attn != d_model:
        d_model = d_model_attn

    ff_w = state_dict["transformer.layers.0.linear1.weight"]  # (dim_feedforward, d_model)
    dim_feedforward = int(getattr(ff_w, "shape")[0])

    layer_ids = set()
    for k in state_dict.keys():
        if isinstance(k, str) and k.startswith("transformer.layers."):
            parts = k.split(".")
            if len(parts) > 2 and parts[2].isdigit():
                layer_ids.add(int(parts[2]))
    num_layers = (max(layer_ids) + 1) if layer_ids else 1

    # nhead is not encoded in parameter shapes; training used nhead=4.
    nhead = 4 if (d_model % 4 == 0) else 8
    if d_model % nhead != 0:
        for candidate in (8, 4, 2, 1, 16):
            if d_model % candidate == 0:
                nhead = candidate
                break

    return TorchModelConfig(
        in_channels=in_channels,
        conv_channels=(c1, c2, c3),
        projection_in=projection_in,
        d_model=d_model,
        nhead=nhead,
        dim_feedforward=dim_feedforward,
        num_layers=num_layers,
    )


def build_model(state_dict: Mapping[str, object]):
    """Rebuild the Audionyx PyTorch model from a raw state_dict.

    The provided `audionyx_model.pt` is a plain state_dict (OrderedDict) rather than TorchScript.
    We reconstruct a compatible nn.Module so `load_state_dict(strict=True)` succeeds.
    """
    import torch.nn as nn

    cfg = _infer_config(state_dict)

    class AudionyxNet(nn.Module):
        def __init__(self):
            super().__init__()
            c1, c2, c3 = cfg.conv_channels
            self.cnn = nn.Sequential(
                nn.Conv2d(cfg.in_channels, c1, kernel_size=3, padding=1),
                nn.BatchNorm2d(c1),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2),
                nn.Conv2d(c1, c2, kernel_size=3, padding=1),
                nn.BatchNorm2d(c2),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2),
                nn.Conv2d(c2, c3, kernel_size=3, padding=1),
                nn.BatchNorm2d(c3),
                nn.ReLU(inplace=True),
                nn.MaxPool2d(2),
            )

            self.early_exit_head = nn.Linear(c3, 1)
            self.projection = nn.Linear(cfg.projection_in, cfg.d_model)

            enc_layer = nn.TransformerEncoderLayer(
                d_model=cfg.d_model,
                nhead=cfg.nhead,
                dim_feedforward=cfg.dim_feedforward,
                dropout=0.0,
                activation="relu",
                batch_first=True,
            )
            self.transformer = nn.TransformerEncoder(enc_layer, num_layers=cfg.num_layers)

            # Final classification head used by the checkpoint.
            # Keys observed: final_head.0.(weight|bias) and final_head.3.(weight|bias)
            self.final_head = nn.Sequential(
                nn.Linear(cfg.d_model, c3),
                nn.ReLU(inplace=True),
                nn.Dropout(p=0.3),
                nn.Linear(c3, 1),
            )

        def forward(self, x):
            # Mirrors the training architecture:
            # CNN output: (B, 64, 8, T_red) for an input (B, 2, 64, T)
            features_2d = self.cnn(x)

            # Early-exit (computed but not returned; we only return final score for inference)
            pooled_early = features_2d.mean(dim=(-1, -2))  # (B, 64)
            _early_logit = self.early_exit_head(pooled_early)

            # Transformer path over time steps
            b, ch, freq, t = features_2d.shape
            seq = features_2d.permute(0, 3, 1, 2).reshape(b, t, ch * freq)  # (B, T_red, 512)
            projected = self.projection(seq)  # (B, T_red, 128)
            context = self.transformer(projected)  # (B, T_red, 128)
            pooled = context.mean(dim=1)  # (B, 128)
            return self.final_head(pooled)

    model = AudionyxNet()

    # Prefer the nhead used during training (4) if it's valid for d_model.
    # This doesn't affect state_dict loading but improves forward compatibility.
    # If 4 isn't divisible, keep inferred.
    return model
