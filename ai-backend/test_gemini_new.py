import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=GEMINI_API_KEY)

def test_gemini_new():
    try:
        print("Testing gemini-3.1-flash-lite-preview...")
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents="Hello, this is a test. Please reply with 'OK'."
        )
        print("Response received:")
        print(response.text)
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_gemini_new()
