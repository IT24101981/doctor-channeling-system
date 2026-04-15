import joblib
model = joblib.load('ai-backend/model/lr_default.pkl')
try:
    print(f"Features: {model.n_features_in_}")
except:
    print("Unknown n_features_in_")
