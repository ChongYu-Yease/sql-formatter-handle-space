import { terser } from 'rollup-plugin-terser'
import babel from 'rollup-plugin-babel'
export default {
    input: './src/sqlFormatter.js',
    output: {
        file: './dist/sqlFormatter.js',
        format: 'umd',
        name: 'xuchongyu',
    },
    plugins: [
        terser(),
        babel({
            exclude: 'node_modules/**',
        }),
    ],
}
