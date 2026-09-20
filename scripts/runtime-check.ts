function show(label: string,value: string | null): void {
  console.log(`${label.padEnd(10)} ${value ?? 'NOT FOUND'}`);
}

console.log('Modern MCP Forge runtime discovery');
console.log('----------------------------------');

show('Bun', process.execPath);
show('Node', Bun.which('node'));
show('python', Bun.which('python'));
show('python3', Bun.which('python3'));
show('py', Bun.which('py'));
show('dotnet', Bun.which('dotnet'));

const nodeFound = Bun.which('node') !== null;

const pythonFound =
  Bun.which('python') !== null ||
  Bun.which('python3') !== null ||
  Bun.which('py') !== null;

console.log('');

if (!nodeFound) {
  console.error('Node.js was not found. Node tools cannot run until "node" is available on PATH.');
}

if (!pythonFound) {
  console.error('Python 3 was not found. Python tools cannot run until python, python3, or py is available on PATH.');
}

if (!nodeFound || !pythonFound) {
  process.exitCode = 1;
} else {
  console.log('Bun, Node.js, and a Python launcher are available.');
}
