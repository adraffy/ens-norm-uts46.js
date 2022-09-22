import {terser} from 'rollup-plugin-terser';
import {nodeResolve} from '@rollup/plugin-node-resolve';

export default {
	input: './src/lib.js',
	plugins: [nodeResolve()],	
	output: [
		{
			file: './dist/index.js',
			format: 'es',
		},
		{
			file: './dist/index.min.js',
			format: 'es',
			plugins: [terser({
				compress: {
					toplevel: true,
					passes: 1, 
					dead_code: true
				}
			})]
		}
	]
}
