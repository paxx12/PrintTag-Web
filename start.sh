#!/bin/bash

# Create tmp directory if it doesn't exist
mkdir -p tmp

# SSL certificate files in tmp/
CERT_FILE="tmp/server.pem"
KEY_FILE="tmp/server.key"

# Generate self-signed SSL certificate if it doesn't exist
if [[ -f "$CERT_FILE" && -f "$KEY_FILE" ]]; then
    echo "Using existing SSL certificates: $CERT_FILE, $KEY_FILE"
else
    echo "Generating self-signed SSL certificate..."
    openssl req -new -x509 -keyout "$KEY_FILE" \
        -out "$CERT_FILE" -days 365 -nodes \
        -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost"

    if [[ $? -eq 0 ]]; then
        echo "SSL certificates generated: $CERT_FILE, $KEY_FILE"
    else
        echo "Error: Failed to generate SSL certificate. Is openssl installed?"
        exit 1
    fi
fi

# Default port
PORT=${1:-8443}

echo ""
echo "Starting HTTPS server on https://localhost:$PORT/"
echo "Press Ctrl+C to stop the server"
echo ""

# Run Python HTTPS server
python3 -m http.server "$PORT" --directory public --tls-cert "$CERT_FILE" --tls-key "$KEY_FILE"
