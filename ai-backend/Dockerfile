FROM python:3.10-slim

# Install system dependencies for OpenCV and EasyOCR
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the files
COPY . .

# Hugging Face Spaces run on port 7860 by default
EXPOSE 7860

# Start command
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
