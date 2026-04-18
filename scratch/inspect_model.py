import joblib
import pandas as pd
import numpy as np

try:
    model = joblib.load('ai-backend/model/lr_default.pkl')
    if hasattr(model, "feature_names_in_"):
        print("Features:", list(model.feature_names_in_))
    else:
        print("No feature names in model.")
except Exception as e:
    print("Error loading model:", e)
