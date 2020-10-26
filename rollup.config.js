import { terser } from 'rollup-plugin-terser'
import babel from 'rollup-plugin-babel'
export default {
    input: './src/sqlFormatter.js',
    // "build:amd": "rollup src/sqlFormatter.js -f amd -o ./dist/sqlFormatter.amd.js",
    // "build:cjs": "rollup src/sqlFormatter.js -f cjs -o ./dist/sqlFormatter.cjs.js",
    // "build:es": "rollup src/sqlFormatter.js -f es -o ./dist/sqlFormatter.es.js",
    // "build:iife": "rollup src/sqlFormatter.js -f iife -n result -o ./dist/sqlFormatter.iife.js",
    // "build:umd": "rollup src/sqlFormatter.js -f umd -n result -o ./dist/sqlFormatter.umd.js",
    // "build:all": "npm run build:amd && npm run build:cjs && npm run build:es && npm run build:iife && npm run build:umd"
    output: [
        {
            file: './dist/sqlFormatter.umd.js',
            format: 'umd',
            name: 'sqlFormatter.umd.js',
        },
        {
            file: './dist/sqlFormatter.cjs.js',
            format: 'cjs',
            name: 'sqlFormatter.cjs.js',
        },
        {
            file: './dist/sqlFormatter.es.js',
            format: 'es',
            name: 'sqlFormatter.es.js',
        },
        {
            file: './dist/sqlFormatter.iife.js',
            format: 'iife',
            name: 'sqlFormatter.iife.js',
        },
        {
            file: './dist/sqlFormatter.amd.js',
            format: 'amd',
            name: 'sqlFormatter.amd.js',
        },
    ],
    plugins: [
        terser(),
        babel({
            exclude: 'node_modules/**',
        }),
    ],
}
