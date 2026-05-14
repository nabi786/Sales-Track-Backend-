const { exec } = require('child_process');

console.log('Finding all Node.js processes...');

// Find all node processes
exec('tasklist /FI "IMAGENAME eq node.exe" /FO CSV', (error, stdout, stderr) => {
  if (error || !stdout || stdout.includes('INFO: No tasks')) {
    console.log('✓ No Node.js processes found');
    return;
  }

  const lines = stdout.trim().split('\n').slice(1); // Skip header
  const pids = [];

  lines.forEach(line => {
    // CSV format: "node.exe","1234","Session Name","Session#","Mem Usage"
    const match = line.match(/"node\.exe","(\d+)"/);
    if (match) {
      pids.push(match[1]);
    }
  });

  if (pids.length === 0) {
    console.log('✓ No Node.js processes found');
    return;
  }

  console.log(`Found ${pids.length} Node.js process(es):`);
  pids.forEach(pid => console.log(`  PID: ${pid}`));

  console.log('\nKilling all Node.js processes...');
  
  // Kill all processes
  let killedCount = 0;
  pids.forEach(pid => {
    exec(`taskkill /F /PID ${pid}`, (error, stdout, stderr) => {
      if (error) {
        console.error(`✗ Failed to kill process ${pid}:`, error.message);
      } else {
        console.log(`✓ Killed process ${pid}`);
        killedCount++;
      }

      if (killedCount === pids.length) {
        console.log(`\n✓ All Node.js processes terminated.`);
        console.log(`Port 8000 should now be free.`);
      }
    });
  });
});










