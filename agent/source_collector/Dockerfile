FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy shared code and agent code
COPY shared/ ./shared/
COPY source_collector/ ./source_collector/

ENV PORT=8001

CMD ["uvicorn", "source_collector.app:a2a_app", "--host", "0.0.0.0", "--port", "8001"]
