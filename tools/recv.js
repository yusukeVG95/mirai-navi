// Tiny local receiver: lets a browser tab hand scraped data to the file system without going through the chat.
// Usage: node --max-http-header-size=4000000 tools/recv.js [outDir]    (default outDir: C:/temp/refresh)
// Browser side:  location.href = 'http://localhost:8799/save?name=events_full.json&d=' + encodeURIComponent(payload)
const http = require('http'), fs = require('fs');
const outDir = process.argv[2] || 'C:/temp/refresh';
fs.mkdirSync(outDir, { recursive: true });
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if(u.pathname === '/save'){
    const name = String(u.searchParams.get('name') || 'x.txt').replace(/[^a-zA-Z0-9_.-]/g, '');
    const data = u.searchParams.get('d') || '';
    fs.writeFileSync(outDir + '/' + name, data, 'utf8');
    console.log('saved', name, data.length);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<p>saved ' + name + '</p><script>setTimeout(()=>history.back(),300)</script>');
  }
  res.writeHead(200); res.end('ok');
}).listen(8799, () => console.log('listening on 8799, saving to', outDir));
