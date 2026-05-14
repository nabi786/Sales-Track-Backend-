const { exec } = require('child_process');
const PORT = process.env.PORT || 8000;

console.log(`Finding process using port ${PORT}...`);

// Find process using the port
exec(`netstat -ano | findstr :${PORT}`, (error, stdout, stderr) => {
  if (error || !stdout.trim()) {
    console.log(`✓ No process found using port ${PORT} - port is free!`);
    return;
  }

  const lines = stdout.trim().split('\n');
  const pids = new Set();

  lines.forEach(line => {
    // Match LISTENING state and extract PID
    if (line.includes('LISTENING')) {
      const match = line.match(/\s+(\d+)$/);
      if (match) {
        pids.add(match[1]);
      }
    }
  });

  if (pids.size === 0) {
    console.log(`✓ No process found using port ${PORT} - port is free!`);
    return;
  }

  console.log(`Found ${pids.size} process(es) using port ${PORT}:`);
  pids.forEach(pid => console.log(`  PID: ${pid}`));

  // Kill all processes synchronously
  let killedCount = 0;
  const totalPids = pids.size;

  pids.forEach(pid => {
    exec(`taskkill /F /PID ${pid}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`✗ Failed to kill process ${pid}:`, error.message);
      } else {
        console.log(`✓ Killed process ${pid}`);
        killedCount++;
      }

      // When all processes are attempted
      if (killedCount + (error ? 0 : 1) >= totalPids) {
        console.log(`\n✓ Port ${PORT} should now be free.`);
        console.log(`You can now start your server with: npm run dev`);
      }
    });
  });
});

