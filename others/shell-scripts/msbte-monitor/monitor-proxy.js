// monitor-proxy.js - MONITOR EVERYTHING (Only skip Google logging)

const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const PORT = 3001;

// ============================================
// Configuration
// ============================================

const CONFIG = {
    // Google domains to silently ignore (don't log, but still proxy if needed)
    ignoredDomains: ['google.com', 'gstatic.com', 'googleapis.com', 'gvt1.com', 'cloudflareinsights.com', 'android.clients.google.com', 'update.googleapis.com', 'safebrowsing.googleapis.com', 'sb-ssl.google.com', 'optimizationguide-pa.googleapis.com'],
    // Log everything else
    logDir: path.join(__dirname, 'monitor-logs'),
    htmlDir: path.join(__dirname, 'monitor-logs', 'html'),
    allRequestsLog: path.join(__dirname, 'monitor-logs', 'all-requests.log'),
};

// ============================================
// Setup Directories
// ============================================

if (!fs.existsSync(CONFIG.logDir)) {
    fs.mkdirSync(CONFIG.logDir, { recursive: true });
}
if (!fs.existsSync(CONFIG.htmlDir)) {
    fs.mkdirSync(CONFIG.htmlDir, { recursive: true });
}

// ============================================
// Logging
// ============================================

const logStream = fs.createWriteStream(
    path.join(CONFIG.logDir, `monitor-${new Date().toISOString().slice(0, 10)}.log`),
    { flags: 'a' }
);

const allRequestsStream = fs.createWriteStream(
    CONFIG.allRequestsLog,
    { flags: 'a' }
);

function log(msg, data = null) {
    const ts = new Date().toISOString();
    const entry = { timestamp: ts, message: msg, data };
    const line = JSON.stringify(entry) + '\n';
    logStream.write(line);
    allRequestsStream.write(line);
    console.log(`[${ts}] ${msg}`);
}

function isIgnored(host) {
    for (const domain of CONFIG.ignoredDomains) {
        if (host && host.includes(domain)) return true;
    }
    return false;
}

// ============================================
// Save HTML response
// ============================================

function saveHtml(host, pathname, data, method) {
    try {
        const htmlContent = data.toString('utf-8');
        if (!htmlContent.includes('<html') && !htmlContent.includes('<!DOCTYPE')) {
            return null;
        }
        
        const safePath = pathname.replace(/\//g, '_').replace(/[^a-zA-Z0-9_\-]/g, '') || 'index';
        const fileName = `${host}${safePath}-${Date.now()}.html`;
        const filePath = path.join(CONFIG.htmlDir, fileName);
        
        fs.writeFileSync(filePath, htmlContent);
        return filePath;
    } catch (err) {
        return null;
    }
}

// ============================================
// Proxy Server
// ============================================

const server = http.createServer();

// Handle HTTPS CONNECT tunnel - LOG EVERYTHING except Google
server.on('connect', (req, clientSocket, head) => {
    const [host, port] = req.url.split(':');
    
    // Log everything except Google domains
    if (!isIgnored(host)) {
        log(`🔗 CONNECT ${host}:${port}`);
    }

    try {
        const targetSocket = net.connect(parseInt(port) || 443, host, () => {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            targetSocket.write(head);
            targetSocket.pipe(clientSocket);
            clientSocket.pipe(targetSocket);
        });

        targetSocket.on('error', (err) => {
            if (!isIgnored(host)) {
                log(`❌ Target error: ${host} - ${err.message}`);
            }
            clientSocket.end();
        });

        clientSocket.on('error', () => {
            targetSocket.end();
        });
    } catch (err) {
        if (!isIgnored(host)) {
            log(`❌ CONNECT error: ${host} - ${err.message}`);
        }
        clientSocket.end();
    }
});

// Handle HTTP/HTTPS requests - LOG EVERYTHING except Google
server.on('request', (req, res) => {
    const requestId = uuidv4().slice(0, 8);
    const startTime = Date.now();
    
    let fullUrl = req.url;
    let host = req.headers.host || 'unknown';
    
    if (!fullUrl.startsWith('http')) {
        fullUrl = `https://${host}${fullUrl}`;
    }
    
    try {
        const url = new URL(fullUrl);
        const isIgnoredHost = isIgnored(url.hostname);
        
        // Log EVERYTHING except Google domains
        if (!isIgnoredHost) {
            log(`[${requestId}] 📤 ${req.method} ${url.hostname}${url.pathname}${url.search || ''}`);
        }

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method: req.method,
            headers: {
                'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0',
                'Accept': req.headers['accept'] || '*/*',
                'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Host': url.hostname,
                'Cache-Control': 'no-cache'
            },
            rejectUnauthorized: false
        };

        if (req.headers.cookie) options.headers.Cookie = req.headers.cookie;
        if (req.headers.referer) options.headers.Referer = req.headers.referer;
        if (req.headers.origin) options.headers.Origin = req.headers.origin;
        if (req.headers['content-type']) options.headers['Content-Type'] = req.headers['content-type'];

        const proxyReq = https.request(options, (proxyRes) => {
            const duration = Date.now() - startTime;
            const isHtml = proxyRes.headers['content-type']?.includes('text/html');
            
            // Log response for everything except Google
            if (!isIgnoredHost) {
                log(`[${requestId}] 📥 ${proxyRes.statusCode} (${duration}ms) ${url.pathname}${isHtml ? ' 📄' : ''}`);
            }

            const chunks = [];
            proxyRes.on('data', (chunk) => chunks.push(chunk));
            proxyRes.on('end', () => {
                const data = Buffer.concat(chunks);
                
                // Save HTML for ALL HTML responses (including Google if we wanted)
                if (isHtml && proxyRes.statusCode === 200 && !isIgnoredHost) {
                    const savedPath = saveHtml(url.hostname, url.pathname, data, req.method);
                    if (savedPath) {
                        log(`[${requestId}] 💾 HTML saved: ${path.basename(savedPath)}`);
                    }
                }

                // Forward response
                const headers = { ...proxyRes.headers };
                delete headers['content-encoding'];
                delete headers['transfer-encoding'];
                delete headers['connection'];
                delete headers['content-length'];

                res.writeHead(proxyRes.statusCode, headers);
                res.end(data);
            });
        });

        proxyReq.on('error', (err) => {
            if (!isIgnoredHost) {
                log(`[${requestId}] ❌ Error: ${err.message}`);
            }
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        });

        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            req.pipe(proxyReq);
        } else {
            proxyReq.end();
        }

    } catch (error) {
        log(`[${requestId}] ❌ Parse error: ${error.message}`);
        res.writeHead(500);
        res.end(JSON.stringify({ error: error.message }));
    }
});

// ============================================
// Monitor Routes
// ============================================

const originalRequestHandler = server.listeners('request')[0];
server.removeAllListeners('request');

server.on('request', (req, res) => {
    if (req.url.startsWith('/monitor/list')) {
        try {
            const files = fs.readdirSync(CONFIG.htmlDir)
                .filter(f => f.endsWith('.html'))
                .map(f => ({
                    filename: f,
                    path: `/monitor/view/${f}`,
                    size: fs.statSync(path.join(CONFIG.htmlDir, f)).size,
                    modified: fs.statSync(path.join(CONFIG.htmlDir, f)).mtime
                }));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files));
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    if (req.url.startsWith('/monitor/view/')) {
        const filename = req.url.replace('/monitor/view/', '');
        const filePath = path.join(CONFIG.htmlDir, filename);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath);
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        } else {
            res.writeHead(404);
            res.end('File not found');
        }
        return;
    }

    originalRequestHandler(req, res);
});

// ============================================
// Start Server
// ============================================

server.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   MSBTE Timetable Monitor Proxy                                 ║
║   Running on: http://localhost:${PORT}                            ║
║                                                                  ║
║   ✅ Logging EVERY request except Google domains                 ║
║   ✅ Saving HTML for every page                                  ║
║   ✅ All requests logged to: ${CONFIG.allRequestsLog}              ║
║                                                                  ║
║   View saved HTML: http://localhost:${PORT}/monitor/list          ║
╚══════════════════════════════════════════════════════════════════╝
`);
});

process.on('SIGINT', () => {
    console.log('\n[Monitor] Shutting down...');
    logStream.end();
    allRequestsStream.end();
    server.close();
    process.exit(0);
});