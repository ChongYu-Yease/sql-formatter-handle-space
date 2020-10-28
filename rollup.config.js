import { terser } from 'rollup-plugin-terser'
import { nodeResolve } from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import babel from 'rollup-plugin-babel'

export default {
    input: './sql-formatter/sql-formatter.js',
    output: [
        {
            file: 'dist/sql-formatter.umd.js',
            name: 'sqlFormatter',
            format: 'umd',
            globals: {
                lodash: 'lodash',
            },
        },
        {
            file: 'dist/sql-formatter.esm.js',
            format: 'esm',
        },
        {
            file: 'dist/sql-formatter.cjs.js',
            format: 'cjs',
        },
    ],
    plugins: [
        nodeResolve(),
        commonjs({
            include: 'node_modules/**',
        }),
        terser(), //开启压缩格式
        babel({
            exclude: 'node_modules/**',
        }),
    ],
}
