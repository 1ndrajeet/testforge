# backend/Dockerfile - Lightweight version
FROM python:3.11-slim

WORKDIR /app

# Install ONLY runtime dependencies (no build tools)
RUN apt-get update && apt-get install -y \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 8000

# Run with uvicorn directly (no gunicorn needed for lightweight)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]