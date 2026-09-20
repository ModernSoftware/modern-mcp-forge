export interface ResolvedCommand {
  executable: string;
  prefixArgs: string[];
}

export function resolvePythonCommand(): ResolvedCommand {
  // On Windows, prefer the Python launcher. This avoids accidentally
  // selecting Microsoft Store execution aliases from WindowsApps.
  if (process.platform === 'win32') {
    const py = Bun.which('py');

    if (py) {
      return {
        executable: py,
        prefixArgs: ['-3']
      };
    }
  }

  const python = Bun.which('python');

  if (python) {
    return {
      executable: python,
      prefixArgs: []
    };
  }

  const python3 = Bun.which('python3');

  if (python3) {
    return {
      executable: python3,
      prefixArgs: []
    };
  }

  // Also allow the launcher as a fallback on unusual PATH configurations.
  const py = Bun.which('py');

  if (py) {
    return {
      executable: py,
      prefixArgs: ['-3']
    };
  }

  throw new Error('Python 3 runtime not found. Install Python 3 and ensure python, python3, or py is available on PATH.');
}
