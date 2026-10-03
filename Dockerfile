FROM python:3.10-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code and dataset assets
COPY backend /app/backend
COPY data /app/data

# Change working directory so `main:app` resolves directly
WORKDIR /app/backend

# Expose FastAPI application port
EXPOSE 8000

# Start server with specified command
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
