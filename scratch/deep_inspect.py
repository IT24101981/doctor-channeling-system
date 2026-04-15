import joblib
import numpy as np

try:
    model = joblib.load('ai-backend/model/lr_default.pkl')
    print("Model Type:", type(model))
    
    # Check for various attributes that might contain feature names
    attrs = ["feature_names_in_", "feature_names", "_feature_names", "columns"]
    found = False
    for attr in attrs:
        if hasattr(model, attr):
            print(f"Found {attr}:", list(getattr(model, attr)))
            found = True
            break
            
    if not found:
        print("No standard feature names found.")
        # Try to inspect individual estimators if it's a wrapper
        if hasattr(model, "estimators_"):
            print("Found multi-output estimators.")

except Exception as e:
    print("Error:", e)
