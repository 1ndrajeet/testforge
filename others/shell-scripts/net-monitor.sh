#!/bin/bash

# Monitor MSBTE timetable network requests with headers
# Usage: ./monitor_msbte.sh [mode]
# modes: basic, detailed, full, mitm

DOMAIN="online.msbte.co.in"
TARGET_URL="https://${DOMAIN}/timetable/"
LOG_DIR="./msbte_logs"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

mkdir -p "$LOG_DIR"

case "${1:-basic}" in
    basic)
        echo "[*] Basic request/response with headers"
        curl -s -I -X GET "$TARGET_URL" \
            -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" \
            -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
            -H "Accept-Language: en-US,en;q=0.5" \
            -H "Accept-Encoding: gzip, deflate, br" \
            -H "Connection: keep-alive" \
            -H "Upgrade-Insecure-Requests: 1" \
            -w "\n\n[Status: %{http_code}] [Time: %{time_total}s] [Size: %{size_download} bytes]\n" \
            2>&1 | tee "${LOG_DIR}/basic_${TIMESTAMP}.log"
        ;;

    detailed)
        echo "[*] Detailed request/response with all headers"
        curl -v -X GET "$TARGET_URL" \
            -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" \
            -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" \
            -H "Accept-Language: en-US,en;q=0.5" \
            -H "Accept-Encoding: gzip, deflate, br" \
            -H "Connection: keep-alive" \
            -H "Upgrade-Insecure-Requests: 1" \
            -H "Sec-Fetch-Dest: document" \
            -H "Sec-Fetch-Mode: navigate" \
            -H "Sec-Fetch-Site: none" \
            -H "Sec-Fetch-User: ?1" \
            -H "Cache-Control: max-age=0" \
            -H "TE: trailers" \
            --compressed \
            2>&1 | tee "${LOG_DIR}/detailed_${TIMESTAMP}.log"
        ;;

    full)
        echo "[*] Full monitoring with all resources (html, css, js, api calls)"
        mkdir -p "${LOG_DIR}/full_${TIMESTAMP}"
        cd "${LOG_DIR}/full_${TIMESTAMP}"
        
        # Capture all network traffic using curl with verbose headers
        curl -v -X GET "$TARGET_URL" \
            -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" \
            -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8" \
            -H "Accept-Language: en-US,en;q=0.5" \
            -H "Accept-Encoding: gzip, deflate, br" \
            -H "Connection: keep-alive" \
            -H "Upgrade-Insecure-Requests: 1" \
            -H "Sec-Fetch-Dest: document" \
            -H "Sec-Fetch-Mode: navigate" \
            -H "Sec-Fetch-Site: none" \
            -H "Sec-Fetch-User: ?1" \
            --compressed \
            --dump-header headers.txt \
            --output response.html \
            2>curl.log

        echo "[*] Also monitoring for API endpoints..."
        grep -i "api\|\.json\|\.xml" response.html | tee -a api_endpoints.txt
        grep -E "fetch\(|XMLHttpRequest|axios|\.get\(|\.post\(" response.html | tee -a js_calls.txt
        
        echo "[*] Logs saved in: ${LOG_DIR}/full_${TIMESTAMP}/"
        cd - > /dev/null
        ;;

    mitm)
        echo "[*] Using mitmproxy for full SSL inspection (requires mitmproxy)"
        echo "[*] Start mitmweb in another terminal first: mitmweb --mode transparent"
        echo "[*] Then configure proxy: export http_proxy=http://localhost:8080"
        echo "[*] Press Enter to continue with current terminal proxy settings..."
        read -p "Press Enter to continue or Ctrl+C to cancel"
        
        export http_proxy=http://localhost:8080
        export https_proxy=http://localhost:8080
        export HTTP_PROXY=http://localhost:8080
        export HTTPS_PROXY=http://localhost:8080
        
        curl -v -X GET "$TARGET_URL" \
            -H "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" \
            -H "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" \
            -H "Accept-Language: en-US,en;q=0.5" \
            --proxy http://localhost:8080 \
            --proxy-header "Host: ${DOMAIN}" \
            2>&1 | tee "${LOG_DIR}/mitm_${TIMESTAMP}.log"
        
        unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY
        ;;

    *)
        echo "Usage: $0 [basic|detailed|full|mitm]"
        echo "  basic   - Show basic request/response headers"
        echo "  detailed - Show verbose request/response with all headers"
        echo "  full    - Capture all resources and extract API calls"
        echo "  mitm    - Use mitmproxy for full SSL inspection"
        exit 1
        ;;
esac

echo "[*] Log saved to: ${LOG_DIR}/*_${TIMESTAMP}.log"