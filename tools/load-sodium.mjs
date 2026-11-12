// Node tests use the npm build of the same libsodium release that js/vendor/ ships for the browser (0.7.15 / 1.0.20).
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
globalThis.sodium = require('libsodium-wrappers-sumo');
export default globalThis.sodium;
