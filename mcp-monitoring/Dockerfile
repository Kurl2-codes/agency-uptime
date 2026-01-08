# Use an official Python runtime as a parent image
FROM python:3.12-slim

# Install Node.js (required for Uptime Kuma MCP)
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    git \
    whois \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Check versions
RUN node -v && npm -v && python --version

# Copy requirements FIRST (for caching)
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application
COPY . .

# Expose port (FastAPI default)
EXPOSE 8000

# Set environment variable for unbuffered logs
ENV PYTHONUNBUFFERED=1

# Command to run the API
CMD ["python", "src/api.py"]
