#!/bin/bash
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting server..."
if [ "$DEBUG" = "true" ] || [ "$DEBUG" = "True" ]; then
    echo "Development mode: uvicorn with reload"
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    echo "Production mode: gunicorn"
    exec gunicorn app.main:app \
        -w ${WORKERS:-4} \
        -k uvicorn.workers.UvicornWorker \
        -b 0.0.0.0:8000 \
        --access-logfile - \
        --error-logfile -
fi
