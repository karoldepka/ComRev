import toast from 'react-hot-toast';

let installed = false;

/**
 * Intercepts console.error to surface THREE.js GLSL compilation failures
 * as a visible toast instead of silently burying them in the console.
 * Safe to call multiple times — only installs once.
 * No-op outside a browser environment.
 */
export function installShaderErrorReporter() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const origError = console.error.bind(console);
  console.error = (...args: any[]) => {
    origError(...args);
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (msg.includes('THREE.WebGLProgram') || msg.includes('Shader Error')) {
      const firstLine = msg.split('\n')[0].trim().slice(0, 140);
      toast.error(`GLSL error: ${firstLine}`, { duration: 10000, id: 'glsl-error' });
    }
  };
}
