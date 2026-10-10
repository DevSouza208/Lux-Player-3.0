FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY requirements.deploy.txt ./requirements.deploy.txt
RUN pip install --no-cache-dir -r requirements.deploy.txt
COPY models ./models
COPY routers ./routers
COPY standalone.py ./standalone.py

EXPOSE 10000
CMD ["sh", "-c", "exec uvicorn standalone:app --host 0.0.0.0 --port ${PORT:-10000} --proxy-headers"]
