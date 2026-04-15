import joblib
try:
    obj = joblib.load('ai-backend/model/lr_scaler.pkl')
    if hasattr(obj, "feature_names_in_"):
        print("\n".join(list(obj.feature_names_in_)))
    else:
        print("No feature names in scaler.")
except Exception as e:
    print("Error:", e)
