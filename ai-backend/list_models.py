import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

try:
    print("Listing models...")
    for model in client.models.list():
        print(f"Model Name: {model.name}, Supported Methods: {model.supported_actions}")
except Exception as e:
    print(f"Error listing models: {e}")
