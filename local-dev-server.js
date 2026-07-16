const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  // Parse URL to ignore query strings (e.g. cache busters)
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let filePath = '.' + parsedUrl.pathname;
  if (filePath === './') {
    filePath = './index.html';
  }
  
  // Resolve absolute path
  const absolutePath = path.resolve(__dirname, filePath);
  
  // Security check: ensure resolved path is inside the project directory
  if (!absolutePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Access Denied');
    return;
  }
  
  fs.access(absolutePath, fs.constants.F_OK, (err) => {
    if (err) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      res.end('404 File Not Found');
      return;
    }
    
    fs.readFile(absolutePath, (error, content) => {
      if (error) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain');
        res.end('Internal Server Error');
        return;
      }
      
      const ext = path.extname(absolutePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      
      res.writeHead(200, { 
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      });
      res.end(content, 'utf-8');
    });
  });
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`ApexMoto POS Local Server Running!`);
  console.log(`Access the application at: http://localhost:${PORT}`);
  console.log(`Press Ctrl+C to stop the server.`);
  console.log(`==================================================\n`);
});
