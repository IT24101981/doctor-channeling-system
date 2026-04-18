import os
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
print(f"API Key: {GEMINI_API_KEY[:5]}...{GEMINI_API_KEY[-5:] if GEMINI_API_KEY else 'None'}")

genai.configure(api_key=GEMINI_API_KEY)

def test_gemini():
    try:
        model = genai.GenerativeModel("gemini-1.5-flash")
        response = model.generate_content("Hello, this is a test. Please reply with 'OK'.")
        print("Response received:")
        print(response.text)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_gemini()
