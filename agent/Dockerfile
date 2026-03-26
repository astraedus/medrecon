FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

ENV PORT=8001

CMD ["uvicorn", "medrecon_agent.app:a2a_app", "--host", "0.0.0.0", "--port", "8001"]
