// perform IDNATestV2, fail on any error
// https://unicode.org/reports/tr46/#Conformance_Testing

import {create_uts46, VERSION} from '../src/uts46.js';
import {explode_cp} from '../src/utils.js';
import {readFileSync} from 'node:fs';

console.log(VERSION);

const uts46 = create_uts46({
	version: 2003, 
	use_STD3: true, 
	//valid_deviations: true, // deprecated in 15.1
	check_hyphens: true,
	check_bidi: true,
	contextJ: true,
	check_leading_cm: true,
	punycode: true,
	// note: an matching Unicode version is required
	// 20240912: 16.0.0 tests pass with 15.1.0 NF
	//nfc: (await import('../../ens-normalize.js/src/nf.js')).nfc
});

for (let [test, cases] of Object.entries(JSON.parse(readFileSync(new URL('../derive/json/IdnaTestV2.json', import.meta.url))))) {
	console.log(test, cases.length);
	for (let [input, output, errors] of cases) {
		// The special error codes X3 and X4_2 are now returned where a toASCII 
		// error code was formerly being generated in toUnicode due to an empty label.
		errors = errors.filter(x => x != 'X4_2' && x != 'X3');
		if (!output) output = input;
		let norm, norm_err;
		try {
			norm = uts46(input);
		} catch (err) {
			norm_err = err.message;
		}
		let type;
		if (errors.length) {
			if (norm_err) {
				type = 'same-error';
			} else {
				type = 'allow-error';
			}
		} else {
			if (norm_err) {
				type = 'reject-valid';
			} else if (norm !== output) {
				type = 'diff-norm';
			} else {
				type = 'same-norm';
			}
		}
		if (!type.startsWith('same')) {
			console.log({input, output, errors, norm, norm_err, type});
			console.log(explode_cp(input).map(x => x.toString(16)).join(' '));
			console.log(explode_cp(output).map(x => x.toString(16)).join(' '));
			throw new Error(test);
		}
	}
}

console.log('OK');
