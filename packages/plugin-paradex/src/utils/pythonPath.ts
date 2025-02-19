import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getPythonPath = () => {
    const pluginRoot = path.resolve(__dirname, '..');
    const pythonDir = path.join(pluginRoot, 'src', 'python');
    const venvPath = path.join(pythonDir, '.venv', 'bin', 'python3');
    return venvPath;
};