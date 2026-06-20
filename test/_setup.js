import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const clipperPath = path.resolve(__dirname, '../dependencies/clipper-lib.cjs');
const ClipperLib = require(clipperPath);
globalThis.ClipperLib = ClipperLib;
